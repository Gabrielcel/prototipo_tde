import { query, withTransaction, advisoryLock } from '../config/database.js';
import { config } from '../config/environment.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { VISIT_OPEN_STATUSES, VISIT_ASSIGNED_OPEN_STATUSES } from '../utils/constants.js';
import { audit } from './audit.service.js';
import { assertVisitAccess, ensureActiveUser, isManager } from './access.service.js';
import { insertNeed, insertReferral } from './needs.service.js';

const visitRow = (row) => ({
    id: row.id,
    familyId: row.family_id,
    familyCode: row.family_code,
    familyContact: row.contact_name,
    neighborhood: row.neighborhood,
    assignedTo: row.assigned_to,
    volunteerName: row.volunteer_name,
    createdBy: row.created_by,
    scheduledAt: row.scheduled_at,
    priority: row.priority,
    status: row.status,
    reason: row.change_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const VISIT_SELECT = `
    SELECT v.*, f.code AS family_code, f.contact_name, f.neighborhood, u.full_name AS volunteer_name
    FROM visits v
    JOIN families f ON f.id = v.family_id
    LEFT JOIN users u ON u.id = v.assigned_to`;

async function loadVisit(executor, visitId) {
    const result = await executor.query(`${VISIT_SELECT} WHERE v.id = $1`, [visitId]);
    return result.rows[0] ? visitRow(result.rows[0]) : null;
}

/** Condições de filtro compartilhadas entre agenda, relatórios e exportação CSV. */
export function visitFilterConditions(filters, values, timezone = config.timezone) {
    const conditions = [];
    if (filters.status === 'abertas') {
        values.push(VISIT_OPEN_STATUSES);
        conditions.push(`v.status = ANY($${values.length}::varchar[])`);
    } else if (filters.status) {
        values.push(filters.status);
        conditions.push(`v.status = $${values.length}`);
    }
    if (filters.volunteerId) {
        values.push(filters.volunteerId);
        conditions.push(`v.assigned_to = $${values.length}`);
    }
    if (filters.familyId) {
        values.push(filters.familyId);
        conditions.push(`v.family_id = $${values.length}`);
    }
    if (filters.from || filters.to) {
        values.push(timezone);
        const tz = `$${values.length}`;
        if (filters.from) {
            values.push(filters.from);
            conditions.push(`v.scheduled_at >= ($${values.length}::date)::timestamp AT TIME ZONE ${tz}`);
        }
        if (filters.to) {
            values.push(filters.to);
            conditions.push(`v.scheduled_at < (($${values.length}::date) + 1)::timestamp AT TIME ZONE ${tz}`);
        }
    }
    return conditions;
}

export async function listVisits(user, filters, { limit, offset }) {
    const effective = { ...filters };
    if (!isManager(user)) effective.volunteerId = user.id;
    const values = [];
    const conditions = visitFilterConditions(effective, values);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const direction = filters.order === 'desc' ? 'DESC' : 'ASC';
    const total = await query(`SELECT COUNT(*)::int AS total FROM visits v ${where}`, values);
    const rows = await query(
        `${VISIT_SELECT} ${where} ORDER BY v.scheduled_at ${direction}, v.id
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );
    return { total: total.rows[0].total, items: rows.rows.map(visitRow) };
}

export async function getVisit(user, visitId) {
    await assertVisitAccess(user, visitId);
    const visit = await loadVisit({ query }, visitId);
    const [record, needs, history] = await Promise.all([
        query(
            `SELECT r.conditions, r.observations, r.checklist_answers, r.completed_at, u.full_name AS completed_by_name
             FROM visit_records r LEFT JOIN users u ON u.id = r.completed_by WHERE r.visit_id = $1`,
            [visitId]
        ),
        query(`SELECT id, category, description, priority, status FROM needs WHERE visit_id = $1 ORDER BY created_at`, [
            visitId,
        ]),
        isManager(user)
            ? query(
                  `SELECT h.action, h.old_scheduled_at, h.new_scheduled_at, h.reason, h.created_at,
                          u.full_name AS user_name, ou.full_name AS old_volunteer, nu.full_name AS new_volunteer
                   FROM visit_history h
                   LEFT JOIN users u ON u.id = h.user_id
                   LEFT JOIN users ou ON ou.id = h.old_assigned_to
                   LEFT JOIN users nu ON nu.id = h.new_assigned_to
                   WHERE h.visit_id = $1 ORDER BY h.created_at DESC, h.id DESC`,
                  [visitId]
              )
            : { rows: [] },
    ]);
    const row = record.rows[0];
    return {
        ...visit,
        record: row
            ? {
                  conditions: row.conditions,
                  observations: row.observations,
                  checklist: row.checklist_answers,
                  completedAt: row.completed_at,
                  completedByName: row.completed_by_name,
              }
            : null,
        needs: needs.rows,
        history: history.rows.map((h) => ({
            action: h.action,
            oldScheduledAt: h.old_scheduled_at,
            newScheduledAt: h.new_scheduled_at,
            reason: h.reason,
            userName: h.user_name,
            oldVolunteer: h.old_volunteer,
            newVolunteer: h.new_volunteer,
            createdAt: h.created_at,
        })),
    };
}

/**
 * Trava família e voluntário (em ordem fixa, para evitar deadlock) e confere os conflitos.
 * Duas requisições simultâneas passam a ser executadas em sequência.
 */
async function lockAndCheckConflicts(client, { familyId, assignedTo, scheduledAt, ignoreVisitId = null }) {
    const keys = [`visit-family:${familyId}`];
    if (assignedTo) keys.push(`visit-volunteer:${assignedTo}`);
    for (const key of keys.sort()) await advisoryLock(client, key);

    const minutes = config.business.visitMinIntervalMinutes;
    const conflictQuery = (column, value) =>
        client.query(
            `SELECT scheduled_at FROM visits
             WHERE ${column} = $1 AND status = ANY($2::varchar[])
               AND scheduled_at > $3::timestamptz - make_interval(mins => $4)
               AND scheduled_at < $3::timestamptz + make_interval(mins => $4)
               AND ($5::uuid IS NULL OR id <> $5)
             LIMIT 1`,
            [value, VISIT_OPEN_STATUSES, scheduledAt, minutes, ignoreVisitId]
        );
    const family = await conflictQuery('family_id', familyId);
    if (family.rowCount) {
        throw conflict(
            `A família já tem uma visita em horário próximo (intervalo mínimo de ${minutes} minutos).`,
            'SCHEDULE_CONFLICT',
            { with: 'family', at: family.rows[0].scheduled_at }
        );
    }
    if (assignedTo) {
        const volunteer = await conflictQuery('assigned_to', assignedTo);
        if (volunteer.rowCount) {
            throw conflict(
                `O voluntário já tem uma visita em horário próximo (intervalo mínimo de ${minutes} minutos).`,
                'SCHEDULE_CONFLICT',
                { with: 'volunteer', at: volunteer.rows[0].scheduled_at }
            );
        }
    }
}

async function visitHistory(client, entry) {
    await client.query(
        `INSERT INTO visit_history (visit_id, user_id, action, old_scheduled_at, new_scheduled_at,
                                    old_assigned_to, new_assigned_to, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
            entry.visitId,
            entry.userId,
            entry.action,
            entry.oldScheduledAt ?? null,
            entry.newScheduledAt ?? null,
            entry.oldAssignedTo ?? null,
            entry.newAssignedTo ?? null,
            entry.reason ?? null,
        ]
    );
}

export async function createVisit(user, data, ip) {
    if (data.assignedTo) await ensureActiveUser(data.assignedTo, { role: 'voluntario', label: 'voluntário' });
    return withTransaction(async (client) => {
        const family = await client.query('SELECT id FROM families WHERE id = $1', [data.familyId]);
        if (!family.rowCount) throw notFound('Família não encontrada.');
        await lockAndCheckConflicts(client, data);
        const result = await client.query(
            `INSERT INTO visits (family_id, assigned_to, created_by, scheduled_at, priority, status)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [
                data.familyId,
                data.assignedTo,
                user.id,
                data.scheduledAt,
                data.priority,
                data.assignedTo ? 'agendada' : 'sem_responsavel',
            ]
        );
        const id = result.rows[0].id;
        await visitHistory(client, {
            visitId: id,
            userId: user.id,
            action: 'criada',
            newScheduledAt: data.scheduledAt,
            newAssignedTo: data.assignedTo,
        });
        await audit(client, { userId: user.id, action: 'visit.create', resourceType: 'visit', resourceId: id, ip });
        return loadVisit(client, id);
    });
}

export async function updateVisit(user, visitId, changes, ip) {
    if (changes.assignedTo) await ensureActiveUser(changes.assignedTo, { role: 'voluntario', label: 'voluntário' });
    return withTransaction(async (client) => {
        const locked = await client.query('SELECT * FROM visits WHERE id = $1 FOR UPDATE', [visitId]);
        const visit = locked.rows[0];
        if (!visit) throw notFound('Visita não encontrada.');
        if (visit.status === 'concluida') throw conflict('Esta visita já foi concluída.', 'VISIT_CLOSED');
        if (visit.status === 'cancelada') throw conflict('Esta visita já foi cancelada.', 'VISIT_CLOSED');

        const oldScheduledAt = new Date(visit.scheduled_at).toISOString();
        const rescheduled = changes.scheduledAt !== undefined && changes.scheduledAt !== oldScheduledAt;
        const assignmentChanged = changes.assignedTo !== undefined && changes.assignedTo !== visit.assigned_to;
        const priorityChanged = changes.priority !== undefined && changes.priority !== visit.priority;
        const cancelling = changes.status === 'cancelada';

        if (!rescheduled && !assignmentChanged && !priorityChanged && !cancelling) {
            throw badRequest('Nenhuma alteração informada.');
        }
        if (cancelling && (rescheduled || assignmentChanged)) {
            throw badRequest('Cancele a visita em uma operação separada.');
        }
        if ((cancelling || rescheduled) && !changes.reason) {
            throw badRequest(cancelling ? 'Informe o motivo do cancelamento.' : 'Informe o motivo do reagendamento.');
        }

        const scheduledAt = rescheduled ? changes.scheduledAt : oldScheduledAt;
        const assignedTo = changes.assignedTo !== undefined ? changes.assignedTo : visit.assigned_to;
        let status = visit.status;
        if (cancelling) status = 'cancelada';
        else if (rescheduled) status = assignedTo ? 'reagendada' : 'sem_responsavel';
        else if (assignmentChanged)
            status = assignedTo ? (visit.status === 'reagendada' ? 'reagendada' : 'agendada') : 'sem_responsavel';

        if (!cancelling && (rescheduled || assignmentChanged)) {
            await lockAndCheckConflicts(client, {
                familyId: visit.family_id,
                assignedTo,
                scheduledAt,
                ignoreVisitId: visitId,
            });
        }
        await client.query(
            `UPDATE visits SET scheduled_at = $2, assigned_to = $3, priority = $4, status = $5,
                    change_reason = COALESCE($6, change_reason)
             WHERE id = $1`,
            [visitId, scheduledAt, assignedTo, changes.priority ?? visit.priority, status, changes.reason ?? null]
        );

        const base = {
            visitId,
            userId: user.id,
            oldScheduledAt,
            newScheduledAt: scheduledAt,
            oldAssignedTo: visit.assigned_to,
            newAssignedTo: assignedTo,
            reason: changes.reason ?? null,
        };
        if (cancelling) await visitHistory(client, { ...base, action: 'cancelada' });
        else if (rescheduled) await visitHistory(client, { ...base, action: 'reagendada' });
        else if (assignmentChanged) {
            await visitHistory(client, { ...base, action: assignedTo ? 'atribuida' : 'desatribuida' });
        }
        await audit(client, {
            userId: user.id,
            action: cancelling ? 'visit.cancel' : rescheduled ? 'visit.reschedule' : 'visit.update',
            resourceType: 'visit',
            resourceId: visitId,
            ip,
        });
        return loadVisit(client, visitId);
    });
}

export async function registerVisit(user, visitId, data, ip) {
    return withTransaction(async (client) => {
        const visit = await assertVisitAccess(user, visitId, client, { lock: true });
        if (visit.status === 'concluida') throw conflict('Esta visita já foi registrada.', 'VISIT_CLOSED');
        if (visit.status === 'cancelada')
            throw conflict('Visitas canceladas não podem ser registradas.', 'VISIT_CLOSED');
        if (!VISIT_ASSIGNED_OPEN_STATUSES.includes(visit.status) || !visit.assigned_to) {
            throw conflict('Atribua um responsável antes de registrar a visita.', 'NO_VOLUNTEER');
        }
        try {
            await client.query(
                `INSERT INTO visit_records (visit_id, completed_by, conditions, observations, checklist_answers)
                 VALUES ($1,$2,$3,$4,$5::jsonb)`,
                [visitId, user.id, data.conditions, data.observations, JSON.stringify(data.checklist)]
            );
        } catch (error) {
            if (error.code === '23505') throw conflict('Esta visita já foi registrada.', 'VISIT_CLOSED');
            throw error;
        }
        await client.query(`UPDATE visits SET status = 'concluida' WHERE id = $1`, [visitId]);

        const needs = [];
        for (const need of data.needs) {
            const needId = await insertNeed(client, user, {
                familyId: visit.family_id,
                visitId,
                category: need.category,
                description: need.description,
                priority: need.priority,
            });
            const referralIds = [];
            for (const referral of need.referrals) {
                referralIds.push(await insertReferral(client, user, needId, referral));
            }
            needs.push({ id: needId, referralIds });
        }
        await visitHistory(client, {
            visitId,
            userId: user.id,
            action: 'concluida',
            oldScheduledAt: visit.scheduled_at,
            newScheduledAt: visit.scheduled_at,
            oldAssignedTo: visit.assigned_to,
            newAssignedTo: visit.assigned_to,
        });
        await audit(client, {
            userId: user.id,
            action: 'visit.complete',
            resourceType: 'visit',
            resourceId: visitId,
            ip,
            metadata: { needs: needs.length },
        });
        return { visitId, status: 'concluida', needs };
    });
}
