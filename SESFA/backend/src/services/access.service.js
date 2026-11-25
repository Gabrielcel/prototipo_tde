// Regras de acesso a registros. Aplicadas no backend, nunca apenas na interface.
import { query } from '../config/database.js';
import { config } from '../config/environment.js';
import { forbidden, notFound, badRequest } from '../utils/errors.js';
import { isUuid } from '../utils/validators.js';

export const isManager = (user) => user.role === 'gestor';

export function requireManager(user) {
    if (!isManager(user)) throw forbidden('Esta ação está disponível somente para gestores.');
}

/**
 * Famílias que um voluntário pode consultar:
 *  1. visita aberta (agendada/reagendada) atribuída a ele;
 *  2. visita concluída atribuída a ele nos últimos N dias (config.business.familyAccessDays);
 *  3. encaminhamento aberto/em andamento sob sua responsabilidade.
 * Visitas canceladas não concedem acesso.
 */
export function volunteerFamilyScope(familyIdExpr, userParam) {
    const days = Number(config.business.familyAccessDays);
    return `(
        EXISTS (SELECT 1 FROM visits av
                WHERE av.family_id = ${familyIdExpr} AND av.assigned_to = ${userParam}
                  AND (av.status IN ('agendada', 'reagendada')
                       OR (av.status = 'concluida' AND av.scheduled_at >= NOW() - INTERVAL '${days} days')))
        OR EXISTS (SELECT 1 FROM referrals ar JOIN needs an ON an.id = ar.need_id
                   WHERE an.family_id = ${familyIdExpr} AND ar.responsible_user_id = ${userParam}
                     AND ar.status IN ('aberto', 'em_andamento'))
    )`;
}

/** Necessidades visíveis ao voluntário: família acessível E vínculo direto com a necessidade. */
export function volunteerNeedScope(alias, userParam) {
    return `(
        ${volunteerFamilyScope(`${alias}.family_id`, userParam)}
        AND (
            ${alias}.created_by = ${userParam}
            OR EXISTS (SELECT 1 FROM visits nv WHERE nv.id = ${alias}.visit_id AND nv.assigned_to = ${userParam})
            OR EXISTS (SELECT 1 FROM referrals nr WHERE nr.need_id = ${alias}.id AND nr.responsible_user_id = ${userParam})
        )
    )`;
}

export async function assertFamilyAccess(user, familyId, executor = { query }) {
    if (!isUuid(familyId)) throw badRequest('Identificador de família inválido.');
    const sql = isManager(user)
        ? 'SELECT 1 FROM families f WHERE f.id = $1'
        : `SELECT 1 FROM families f WHERE f.id = $1 AND ${volunteerFamilyScope('f.id', '$2')}`;
    const values = isManager(user) ? [familyId] : [familyId, user.id];
    const result = await executor.query(sql, values);
    if (!result.rowCount) throw notFound('Família não encontrada.');
}

export async function assertVisitAccess(user, visitId, executor = { query }, { lock = false } = {}) {
    if (!isUuid(visitId)) throw badRequest('Identificador de visita inválido.');
    const result = await executor.query(`SELECT * FROM visits WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [visitId]);
    const visit = result.rows[0];
    if (!visit || (!isManager(user) && visit.assigned_to !== user.id)) {
        throw notFound('Visita não encontrada.');
    }
    return visit;
}

export async function assertNeedAccess(user, needId, executor = { query }) {
    if (!isUuid(needId)) throw badRequest('Identificador de necessidade inválido.');
    const sql = isManager(user)
        ? 'SELECT n.* FROM needs n WHERE n.id = $1'
        : `SELECT n.* FROM needs n WHERE n.id = $1 AND ${volunteerNeedScope('n', '$2')}`;
    const result = await executor.query(sql, isManager(user) ? [needId] : [needId, user.id]);
    if (!result.rows[0]) throw notFound('Necessidade não encontrada.');
    return result.rows[0];
}

/** Garante que o usuário existe, está ativo e (opcionalmente) tem o perfil esperado. */
export async function ensureActiveUser(userId, { role, label = 'responsável' } = {}, executor = { query }) {
    if (!isUuid(userId)) throw badRequest(`Identificador de ${label} inválido.`);
    const result = await executor.query(
        `SELECT id FROM users WHERE id = $1 AND status = 'ativo' ${role ? 'AND role = $2' : ''}`,
        role ? [userId, role] : [userId]
    );
    if (!result.rowCount) throw badRequest(`Selecione um ${label} ativo.`);
}
