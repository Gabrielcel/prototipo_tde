import { query, withTransaction } from '../config/database.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { NEED_TRANSITIONS, REFERRAL_TRANSITIONS } from '../utils/constants.js';
import { audit } from './audit.service.js';
import {
    assertFamilyAccess,
    assertNeedAccess,
    assertVisitAccess,
    ensureActiveUser,
    isManager,
    volunteerNeedScope,
} from './access.service.js';

const REFERRALS_JSON = `COALESCE((
    SELECT json_agg(json_build_object(
        'id', r.id, 'type', r.type, 'status', r.status, 'description', r.description,
        'responsibleUserId', r.responsible_user_id, 'responsibleName', ru.full_name,
        'createdAt', r.created_at) ORDER BY r.created_at)
    FROM referrals r LEFT JOIN users ru ON ru.id = r.responsible_user_id
    WHERE r.need_id = n.id), '[]'::json)`;

const NEED_SELECT = `
    SELECT n.id, n.family_id, f.code AS family_code, f.contact_name AS family_contact, n.visit_id,
           n.created_by, cu.full_name AS created_by_name, n.category, n.description, n.priority,
           n.status, n.created_at, n.updated_at, ${REFERRALS_JSON} AS referrals
    FROM needs n
    JOIN families f ON f.id = n.family_id
    LEFT JOIN users cu ON cu.id = n.created_by`;

const NEED_ORDER = `ORDER BY (n.status = 'resolvida'),
    CASE n.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, n.created_at DESC`;

const needRow = (row) => ({
    id: row.id,
    familyId: row.family_id,
    familyCode: row.family_code,
    familyContact: row.family_contact,
    visitId: row.visit_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    referrals: row.referrals,
});

function assertTransition(map, from, to, user, label) {
    if (from === to) return false;
    const rule = map[from];
    if (!rule.to.includes(to))
        throw conflict(`Não é possível mudar ${label} de "${from}" para "${to}".`, 'INVALID_TRANSITION');
    if (rule.gestorOnly.includes(to) && !isManager(user)) {
        throw forbidden('Somente gestores podem reabrir este registro.');
    }
    return true;
}

async function statusHistory(client, entityType, entityId, from, to, userId, note = null) {
    await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, user_id, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [entityType, entityId, from, to, userId, note]
    );
}

/** Inserção compartilhada com o registro de visita (mesma transação). */
export async function insertNeed(client, user, { familyId, visitId, category, description, priority }) {
    const result = await client.query(
        `INSERT INTO needs (family_id, visit_id, created_by, category, description, priority)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [familyId, visitId ?? null, user.id, category, description, priority]
    );
    const id = result.rows[0].id;
    await statusHistory(client, 'need', id, null, 'pendente', user.id);
    return id;
}

export async function insertReferral(client, user, needId, { type, responsibleUserId, description }) {
    if (responsibleUserId) await ensureActiveUser(responsibleUserId, {}, client);
    const result = await client.query(
        `INSERT INTO referrals (need_id, responsible_user_id, type, description, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [needId, responsibleUserId ?? null, type, description ?? null, user.id]
    );
    const id = result.rows[0].id;
    await statusHistory(client, 'referral', id, null, 'aberto', user.id);
    return id;
}

export async function listNeedsForFamily(user, familyId) {
    const values = [familyId];
    let scope = '';
    if (!isManager(user)) {
        values.push(user.id);
        scope = `AND ${volunteerNeedScope('n', '$2')}`;
    }
    const result = await query(`${NEED_SELECT} WHERE n.family_id = $1 ${scope} ${NEED_ORDER}`, values);
    return result.rows.map(needRow);
}

export async function listNeeds(user, filters, { limit, offset }) {
    const conditions = [];
    const values = [];
    if (!isManager(user)) {
        values.push(user.id);
        conditions.push(volunteerNeedScope('n', `$${values.length}`));
    }
    for (const [key, column] of [
        ['status', 'n.status'],
        ['priority', 'n.priority'],
        ['category', 'n.category'],
        ['familyId', 'n.family_id'],
    ]) {
        if (filters[key]) {
            values.push(filters[key]);
            conditions.push(`${column} = $${values.length}`);
        }
    }
    if (filters.notResolved) conditions.push(`n.status <> 'resolvida'`);
    if (filters.hasReferral !== null && filters.hasReferral !== undefined) {
        const exists = `EXISTS (SELECT 1 FROM referrals xr WHERE xr.need_id = n.id AND xr.status <> 'cancelado')`;
        conditions.push(filters.hasReferral ? exists : `NOT ${exists}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query(`SELECT COUNT(*)::int AS total FROM needs n ${where}`, values);
    const rows = await query(
        `${NEED_SELECT} ${where} ${NEED_ORDER} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );
    return { total: total.rows[0].total, items: rows.rows.map(needRow) };
}

export async function getNeed(user, needId) {
    await assertNeedAccess(user, needId);
    const result = await query(`${NEED_SELECT} WHERE n.id = $1`, [needId]);
    const need = needRow(result.rows[0]);
    const history = await query(
        `SELECT h.entity_type, h.entity_id, h.from_status, h.to_status, h.note, h.created_at, u.full_name AS user_name
         FROM status_history h LEFT JOIN users u ON u.id = h.user_id
         WHERE (h.entity_type = 'need' AND h.entity_id = $1)
            OR (h.entity_type = 'referral' AND h.entity_id IN (SELECT id FROM referrals WHERE need_id = $1))
         ORDER BY h.created_at DESC, h.id DESC`,
        [needId]
    );
    need.history = history.rows.map((row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        from: row.from_status,
        to: row.to_status,
        note: row.note,
        userName: row.user_name,
        createdAt: row.created_at,
    }));
    return need;
}

export async function createNeed(user, data, ip) {
    return withTransaction(async (client) => {
        if (data.visitId) {
            const visit = await assertVisitAccess(user, data.visitId, client);
            if (visit.family_id !== data.familyId) throw badRequest('A visita não pertence à família escolhida.');
        }
        await assertFamilyAccess(user, data.familyId, client);
        const id = await insertNeed(client, user, data);
        await audit(client, { userId: user.id, action: 'need.create', resourceType: 'need', resourceId: id, ip });
        const result = await client.query(`${NEED_SELECT} WHERE n.id = $1`, [id]);
        return needRow(result.rows[0]);
    });
}

export async function updateNeed(user, needId, changes, ip) {
    return withTransaction(async (client) => {
        const visible = await assertNeedAccess(user, needId, client);
        const locked = await client.query('SELECT * FROM needs WHERE id = $1 FOR UPDATE', [needId]);
        const current = locked.rows[0] ?? visible;

        const editsContent = ['category', 'description', 'priority'].some((key) => changes[key] !== undefined);
        if (editsContent && !isManager(user) && current.created_by !== user.id) {
            throw forbidden('Você só pode editar o conteúdo de necessidades registradas por você.');
        }
        const statusChanged =
            changes.status !== undefined &&
            assertTransition(NEED_TRANSITIONS, current.status, changes.status, user, 'a necessidade');

        const next = {
            category: changes.category ?? current.category,
            description: changes.description ?? current.description,
            priority: changes.priority ?? current.priority,
            status: changes.status ?? current.status,
        };
        await client.query(
            `UPDATE needs SET category = $2, description = $3, priority = $4, status = $5 WHERE id = $1`,
            [needId, next.category, next.description, next.priority, next.status]
        );
        if (statusChanged) await statusHistory(client, 'need', needId, current.status, next.status, user.id);
        await audit(client, {
            userId: user.id,
            action: 'need.update',
            resourceType: 'need',
            resourceId: needId,
            ip,
            metadata: { statusChanged: statusChanged ? { from: current.status, to: next.status } : false },
        });
        const result = await client.query(`${NEED_SELECT} WHERE n.id = $1`, [needId]);
        return needRow(result.rows[0]);
    });
}

const referralRow = (row) => ({
    id: row.id,
    needId: row.need_id,
    type: row.type,
    description: row.description,
    status: row.status,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    category: row.category,
    needDescription: row.need_description,
    familyId: row.family_id,
    familyCode: row.family_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const REFERRAL_SELECT = `
    SELECT r.id, r.need_id, r.type, r.description, r.status, r.responsible_user_id,
           ru.full_name AS responsible_name, n.category, n.description AS need_description,
           n.family_id, f.code AS family_code, r.created_at, r.updated_at
    FROM referrals r
    JOIN needs n ON n.id = r.need_id
    JOIN families f ON f.id = n.family_id
    LEFT JOIN users ru ON ru.id = r.responsible_user_id`;

export async function createReferral(user, needId, data, ip) {
    return withTransaction(async (client) => {
        const need = await assertNeedAccess(user, needId, client);
        const locked = await client.query('SELECT status FROM needs WHERE id = $1 FOR UPDATE', [needId]);
        if ((locked.rows[0]?.status ?? need.status) === 'resolvida') {
            throw conflict('A necessidade já foi resolvida. Reabra-a antes de criar encaminhamentos.', 'NEED_RESOLVED');
        }
        const id = await insertReferral(client, user, needId, data);
        await audit(client, {
            userId: user.id,
            action: 'referral.create',
            resourceType: 'referral',
            resourceId: id,
            ip,
        });
        const result = await client.query(`${REFERRAL_SELECT} WHERE r.id = $1`, [id]);
        return referralRow(result.rows[0]);
    });
}

export async function listReferrals(user, filters, { limit, offset }) {
    const conditions = [];
    const values = [];
    if (!isManager(user)) {
        values.push(user.id);
        const param = `$${values.length}`;
        conditions.push(`(r.responsible_user_id = ${param} OR ${volunteerNeedScope('n', param)})`);
    }
    for (const [key, column] of [
        ['status', 'r.status'],
        ['needId', 'r.need_id'],
        ['responsibleId', 'r.responsible_user_id'],
        ['type', 'r.type'],
    ]) {
        if (filters[key]) {
            values.push(filters[key]);
            conditions.push(`${column} = $${values.length}`);
        }
    }
    if (filters.mine) {
        values.push(user.id);
        conditions.push(`r.responsible_user_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query(
        `SELECT COUNT(*)::int AS total FROM referrals r JOIN needs n ON n.id = r.need_id ${where}`,
        values
    );
    const rows = await query(
        `${REFERRAL_SELECT} ${where} ORDER BY (r.status IN ('concluido', 'cancelado')), r.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );
    return { total: total.rows[0].total, items: rows.rows.map(referralRow) };
}

export async function updateReferral(user, referralId, changes, ip) {
    return withTransaction(async (client) => {
        const locked = await client.query(
            `SELECT r.*, n.family_id FROM referrals r JOIN needs n ON n.id = r.need_id WHERE r.id = $1 FOR UPDATE OF r`,
            [referralId]
        );
        const current = locked.rows[0];
        if (!current) throw notFound('Encaminhamento não encontrado.');

        const isResponsible = current.responsible_user_id === user.id;
        if (!isManager(user)) {
            // Voluntário só atua no que é seu: precisa ser o responsável atual.
            if (!isResponsible) throw notFound('Encaminhamento não encontrado.');
            if (changes.responsibleUserId !== undefined) {
                throw forbidden('Somente gestores podem trocar o responsável.');
            }
        }
        if (changes.responsibleUserId) await ensureActiveUser(changes.responsibleUserId, {}, client);

        const statusChanged =
            changes.status !== undefined &&
            assertTransition(REFERRAL_TRANSITIONS, current.status, changes.status, user, 'o encaminhamento');

        const next = {
            status: changes.status ?? current.status,
            description: changes.description !== undefined ? changes.description : current.description,
            responsibleUserId:
                changes.responsibleUserId !== undefined ? changes.responsibleUserId : current.responsible_user_id,
        };
        await client.query(
            `UPDATE referrals SET status = $2, description = $3, responsible_user_id = $4 WHERE id = $1`,
            [referralId, next.status, next.description, next.responsibleUserId]
        );
        if (statusChanged) await statusHistory(client, 'referral', referralId, current.status, next.status, user.id);
        if (next.responsibleUserId !== current.responsible_user_id) {
            await statusHistory(
                client,
                'referral',
                referralId,
                next.status,
                next.status,
                user.id,
                'Responsável alterado'
            );
        }
        await audit(client, {
            userId: user.id,
            action: 'referral.update',
            resourceType: 'referral',
            resourceId: referralId,
            ip,
            metadata: { statusChanged: statusChanged ? { from: current.status, to: next.status } : false },
        });
        const result = await client.query(`${REFERRAL_SELECT} WHERE r.id = $1`, [referralId]);
        return referralRow(result.rows[0]);
    });
}
