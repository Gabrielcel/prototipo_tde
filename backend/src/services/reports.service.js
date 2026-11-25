import { query } from '../config/database.js';
import { config } from '../config/environment.js';
import { buildCsv } from '../utils/csv.js';
import { formatDateTime } from '../utils/dates.js';
import { isManager } from './access.service.js';
import { listNeeds } from './needs.service.js';
import { visitFilterConditions } from './visits.service.js';

const PRIORITY_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const STATUS_LABEL = {
    agendada: 'Agendada',
    sem_responsavel: 'Sem responsável',
    reagendada: 'Reagendada',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
};

/** Voluntário só enxerga o próprio recorte; gestor pode filtrar por voluntário. */
function scopeFilters(user, filters) {
    return { ...filters, volunteerId: isManager(user) ? (filters.volunteerId ?? null) : user.id };
}

function rangeConditions(column, filters, values) {
    const conditions = [];
    if (!filters.from && !filters.to) return conditions;
    values.push(config.timezone);
    const tz = `$${values.length}`;
    if (filters.from) {
        values.push(filters.from);
        conditions.push(`${column} >= ($${values.length}::date)::timestamp AT TIME ZONE ${tz}`);
    }
    if (filters.to) {
        values.push(filters.to);
        conditions.push(`${column} < (($${values.length}::date) + 1)::timestamp AT TIME ZONE ${tz}`);
    }
    return conditions;
}

/** Necessidades do voluntário: criadas por ele ou nascidas de visitas dele (inclui as sem visita vinculada). */
const volunteerNeedCondition = (param) =>
    `(n.created_by = ${param} OR EXISTS (SELECT 1 FROM visits nv WHERE nv.id = n.visit_id AND nv.assigned_to = ${param}))`;

async function grouped(sql, values) {
    const result = await query(sql, values);
    return Object.fromEntries(result.rows.map((row) => [row.key, row.total]));
}

const withTotal = (byKey) => ({
    total: Object.values(byKey).reduce((sum, value) => sum + value, 0),
    byStatus: byKey,
});

export async function getSummary(user, rawFilters) {
    const filters = scopeFilters(user, rawFilters);

    const visitValues = [];
    const visitConditions = visitFilterConditions({ ...filters, status: null }, visitValues);
    const visitWhere = visitConditions.length ? `WHERE ${visitConditions.join(' AND ')}` : '';

    const needValues = [];
    const needConditions = rangeConditions('n.created_at', filters, needValues);
    if (filters.volunteerId) {
        needValues.push(filters.volunteerId);
        needConditions.push(volunteerNeedCondition(`$${needValues.length}`));
    }
    const needWhere = needConditions.length ? `WHERE ${needConditions.join(' AND ')}` : '';

    const referralValues = [];
    const referralConditions = rangeConditions('r.created_at', filters, referralValues);
    if (filters.volunteerId) {
        referralValues.push(filters.volunteerId);
        const param = `$${referralValues.length}`;
        referralConditions.push(
            `(r.responsible_user_id = ${param} OR EXISTS (SELECT 1 FROM needs n WHERE n.id = r.need_id AND ${volunteerNeedCondition(param)}))`
        );
    }
    const referralWhere = referralConditions.length ? `WHERE ${referralConditions.join(' AND ')}` : '';

    const [visits, byVolunteer, needsByStatus, needsByCategory, needsByPriority, referrals] = await Promise.all([
        grouped(
            `SELECT v.status AS key, COUNT(*)::int AS total FROM visits v ${visitWhere} GROUP BY v.status`,
            visitValues
        ),
        query(
            `SELECT COALESCE(u.full_name, 'Sem responsável') AS name, COUNT(*)::int AS total
             FROM visits v LEFT JOIN users u ON u.id = v.assigned_to ${visitWhere}
             GROUP BY u.full_name ORDER BY total DESC, name`,
            visitValues
        ),
        grouped(
            `SELECT n.status AS key, COUNT(*)::int AS total FROM needs n ${needWhere} GROUP BY n.status`,
            needValues
        ),
        grouped(
            `SELECT n.category AS key, COUNT(*)::int AS total FROM needs n ${needWhere} GROUP BY n.category`,
            needValues
        ),
        grouped(
            `SELECT n.priority AS key, COUNT(*)::int AS total FROM needs n ${needWhere} GROUP BY n.priority`,
            needValues
        ),
        grouped(
            `SELECT r.status AS key, COUNT(*)::int AS total FROM referrals r ${referralWhere} GROUP BY r.status`,
            referralValues
        ),
    ]);

    return {
        filters: { from: filters.from ?? null, to: filters.to ?? null, volunteerId: filters.volunteerId ?? null },
        visits: withTotal(visits),
        visitsByVolunteer: byVolunteer.rows,
        needs: {
            ...withTotal(needsByStatus),
            byCategory: needsByCategory,
            byPriority: needsByPriority,
        },
        referrals: withTotal(referrals),
    };
}

export async function exportVisitsCsv(user, rawFilters) {
    const filters = scopeFilters(user, rawFilters);
    const values = [];
    const conditions = visitFilterConditions(filters, values);
    const result = await query(
        `SELECT v.scheduled_at, v.priority, v.status, v.change_reason, f.code AS family_code,
                u.full_name AS volunteer_name
         FROM visits v JOIN families f ON f.id = v.family_id LEFT JOIN users u ON u.id = v.assigned_to
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY v.scheduled_at, v.id`,
        values
    );
    const rows = result.rows.map((row) => {
        const { date, time } = formatDateTime(row.scheduled_at);
        return [
            date,
            time,
            row.family_code,
            row.volunteer_name ?? '',
            PRIORITY_LABEL[row.priority],
            STATUS_LABEL[row.status],
            row.change_reason ?? '',
        ];
    });
    return buildCsv(['Data', 'Horário', 'Família', 'Responsável', 'Prioridade', 'Situação', 'Motivo'], rows);
}

export async function getDashboard(user) {
    const manager = isManager(user);
    const visitValues = [config.timezone];
    let visitScope = '';
    if (!manager) {
        visitValues.push(user.id);
        visitScope = 'AND v.assigned_to = $2';
    }
    const counts = await query(
        `SELECT
            COUNT(*) FILTER (WHERE v.status IN ('agendada','reagendada','sem_responsavel')
                AND (v.scheduled_at AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date)::int AS today,
            COUNT(*) FILTER (WHERE v.status IN ('agendada','reagendada','sem_responsavel')
                AND v.scheduled_at >= NOW())::int AS upcoming,
            COUNT(*) FILTER (WHERE v.status = 'concluida'
                AND v.scheduled_at >= NOW() - INTERVAL '30 days')::int AS completed_30d,
            COUNT(*) FILTER (WHERE v.status = 'sem_responsavel')::int AS unassigned,
            COUNT(*) FILTER (WHERE v.status = 'reagendada')::int AS rescheduled,
            COUNT(*) FILTER (WHERE v.status IN ('agendada','reagendada','sem_responsavel')
                AND v.scheduled_at < NOW())::int AS overdue
         FROM visits v WHERE TRUE ${visitScope}`,
        visitValues
    );
    const upcoming = await query(
        `${VISIT_PREVIEW} WHERE v.status IN ('agendada','reagendada','sem_responsavel') AND v.scheduled_at >= NOW()
         ${visitScope.replace('$2', '$1')} ORDER BY v.scheduled_at LIMIT 5`,
        manager ? [] : [user.id]
    );

    const page = { limit: 1, offset: 0 };
    const [pendingNeeds, noReferral, myReferrals] = await Promise.all([
        listNeeds(user, { status: 'pendente' }, page),
        listNeeds(user, { hasReferral: false, notResolved: true }, page),
        query(
            `SELECT COUNT(*)::int AS total FROM referrals
             WHERE responsible_user_id = $1 AND status IN ('aberto', 'em_andamento')`,
            [user.id]
        ),
    ]);
    const c = counts.rows[0];
    return {
        visits: {
            today: c.today,
            upcoming: c.upcoming,
            completedLast30Days: c.completed_30d,
            unassigned: manager ? c.unassigned : 0,
            rescheduled: c.rescheduled,
            overdue: c.overdue,
        },
        needs: { pending: pendingNeeds.total, withoutReferral: noReferral.total },
        referrals: { openMine: myReferrals.rows[0].total },
        upcomingVisits: upcoming.rows.map((row) => ({
            id: row.id,
            scheduledAt: row.scheduled_at,
            status: row.status,
            priority: row.priority,
            familyCode: row.family_code,
            familyContact: row.contact_name,
            volunteerName: row.volunteer_name,
        })),
    };
}

const VISIT_PREVIEW = `
    SELECT v.id, v.scheduled_at, v.status, v.priority, f.code AS family_code, f.contact_name,
           u.full_name AS volunteer_name
    FROM visits v JOIN families f ON f.id = v.family_id LEFT JOIN users u ON u.id = v.assigned_to`;
