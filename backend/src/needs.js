import {
  ApiError,
  assertFamilyAccess,
  assertVisitAccess,
  ensureActiveVolunteer,
  isUuid,
} from './access.js';
import { query } from './db.js';

const priorities = ['alta', 'media', 'baixa'];
const needStatuses = ['pendente', 'em_andamento', 'resolvida'];
const referralTypes = ['encaminhamento', 'pendencia'];
const referralStatuses = ['aberto', 'em_andamento', 'concluido', 'cancelado'];

function validateNeed(data, partial = false) {
  const result = {};

  if (!partial || 'category' in data) {
    const category = typeof data.category === 'string' ? data.category.trim() : '';
    if (!category || category.length > 60) throw new ApiError(400, 'Informe a categoria da necessidade.');
    result.category = category;
  }
  if (!partial || 'description' in data) {
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (!description || description.length > 2000) throw new ApiError(400, 'Informe a descrição da necessidade.');
    result.description = description;
  }
  if (!partial || 'priority' in data) {
    const priority = typeof data.priority === 'string' ? data.priority.trim().toLowerCase() : '';
    if (!priorities.includes(priority)) throw new ApiError(400, 'Prioridade de necessidade inválida.');
    result.priority = priority;
  }
  if (partial && 'status' in data) {
    if (!needStatuses.includes(data.status)) throw new ApiError(400, 'Situação de necessidade inválida.');
    result.status = data.status;
  }

  return result;
}

export async function listNeeds(user, filters = {}) {
  const conditions = [];
  const values = [];

  if (user.role !== 'gestor') {
    values.push(user.id);
    conditions.push(
      `EXISTS (SELECT 1 FROM visits v WHERE v.family_id = n.family_id AND v.assigned_to = $${values.length})`
    );
  }
  if (filters.status) {
    if (!needStatuses.includes(filters.status)) throw new ApiError(400, 'Filtro de situação inválido.');
    values.push(filters.status);
    conditions.push(`n.status = $${values.length}`);
  }
  if (filters.familyId) {
    if (!isUuid(filters.familyId)) throw new ApiError(400, 'Identificador de família inválido.');
    values.push(filters.familyId);
    conditions.push(`n.family_id = $${values.length}`);
  }

  const result = await query(
    `SELECT n.id, n.family_id, f.code AS family_code, n.visit_id,
            n.category, n.description, n.priority, n.status, n.created_at,
            COALESCE(json_agg(json_build_object(
              'id', r.id, 'type', r.type, 'status', r.status,
              'description', r.description, 'responsibleUserId', r.responsible_user_id
            )) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS referrals
     FROM needs n
     JOIN families f ON f.id = n.family_id
     LEFT JOIN referrals r ON r.need_id = n.id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY n.id, f.code
     ORDER BY n.created_at DESC`,
    values
  );

  return result.rows.map(row => ({
    id: row.id,
    familyId: row.family_id,
    familyCode: row.family_code,
    visitId: row.visit_id,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    referrals: row.referrals,
  }));
}

export async function createNeed(user, data) {
  if (!isUuid(data.familyId)) throw new ApiError(400, 'Selecione uma família válida.');
  const need = validateNeed(data);

  if (data.visitId) {
    if (!isUuid(data.visitId)) throw new ApiError(400, 'Identificador de visita inválido.');
    const visit = await assertVisitAccess(user, data.visitId);
    if (visit.family_id !== data.familyId) throw new ApiError(400, 'A visita não pertence à família escolhida.');
  } else {
    await assertFamilyAccess(user, data.familyId);
  }

  const result = await query(
    `INSERT INTO needs (family_id, visit_id, created_by, category, description, priority)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, family_id, visit_id, category, description, priority, status, created_at`,
    [data.familyId, data.visitId || null, user.id, need.category, need.description, need.priority]
  );
  const row = result.rows[0];

  return {
    id: row.id,
    familyId: row.family_id,
    visitId: row.visit_id,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function updateNeed(user, needId, data) {
  if (!isUuid(needId)) throw new ApiError(400, 'Identificador de necessidade inválido.');
  const needData = validateNeed(data, true);
  if (!Object.keys(needData).length) throw new ApiError(400, 'Informe ao menos um campo para atualizar.');

  const current = await query('SELECT id, family_id FROM needs WHERE id = $1', [needId]);
  if (!current.rows[0]) throw new ApiError(404, 'Necessidade não encontrada.');
  await assertFamilyAccess(user, current.rows[0].family_id);

  const columns = { category: 'category', description: 'description', priority: 'priority', status: 'status' };
  const fields = Object.keys(needData);
  const assignments = fields.map((field, index) => `${columns[field]} = $${index + 2}`);
  const result = await query(
    `UPDATE needs SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING id, family_id, visit_id, category, description, priority, status, created_at`,
    [needId, ...fields.map(field => needData[field])]
  );
  const row = result.rows[0];

  return {
    id: row.id,
    familyId: row.family_id,
    visitId: row.visit_id,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function createReferral(user, needId, data) {
  if (!isUuid(needId)) throw new ApiError(400, 'Identificador de necessidade inválido.');
  const type = typeof data.type === 'string' ? data.type.trim().toLowerCase() : '';
  if (!referralTypes.includes(type)) throw new ApiError(400, 'Tipo de encaminhamento inválido.');
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (description.length > 2000) throw new ApiError(400, 'A descrição excede o limite de caracteres.');
  const responsibleUserId = data.responsibleUserId || null;
  if (responsibleUserId) await ensureActiveVolunteer(responsibleUserId);

  const need = await query('SELECT family_id FROM needs WHERE id = $1', [needId]);
  if (!need.rows[0]) throw new ApiError(404, 'Necessidade não encontrada.');
  await assertFamilyAccess(user, need.rows[0].family_id);

  const result = await query(
    `INSERT INTO referrals (need_id, responsible_user_id, type, description)
     VALUES ($1,$2,$3,$4)
     RETURNING id, need_id, responsible_user_id, type, description, status, created_at`,
    [needId, responsibleUserId, type, description || null]
  );
  const row = result.rows[0];

  return {
    id: row.id,
    needId: row.need_id,
    responsibleUserId: row.responsible_user_id,
    type: row.type,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listReferrals(user) {
  const values = [];
  let where = '';
  if (user.role !== 'gestor') {
    values.push(user.id);
    where = `WHERE EXISTS (
      SELECT 1 FROM needs n JOIN visits v ON v.family_id = n.family_id
      WHERE n.id = r.need_id AND v.assigned_to = $1
    )`;
  }

  const result = await query(
    `SELECT r.id, r.need_id, r.responsible_user_id, r.type, r.description, r.status,
            r.created_at, n.category, n.family_id, f.code AS family_code
     FROM referrals r
     JOIN needs n ON n.id = r.need_id
     JOIN families f ON f.id = n.family_id
     ${where}
     ORDER BY r.created_at DESC`,
    values
  );

  return result.rows.map(row => ({
    id: row.id,
    needId: row.need_id,
    responsibleUserId: row.responsible_user_id,
    type: row.type,
    description: row.description,
    status: row.status,
    category: row.category,
    familyId: row.family_id,
    familyCode: row.family_code,
    createdAt: row.created_at,
  }));
}

export async function updateReferral(user, referralId, data) {
  if (!isUuid(referralId)) throw new ApiError(400, 'Identificador de encaminhamento inválido.');
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  if (!referralStatuses.includes(status)) throw new ApiError(400, 'Situação de encaminhamento inválida.');

  const current = await query(
    `SELECT r.id, n.family_id FROM referrals r JOIN needs n ON n.id = r.need_id WHERE r.id = $1`,
    [referralId]
  );
  if (!current.rows[0]) throw new ApiError(404, 'Encaminhamento não encontrado.');
  await assertFamilyAccess(user, current.rows[0].family_id);

  const result = await query(
    `UPDATE referrals SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, need_id, responsible_user_id, type, description, status, created_at`,
    [referralId, status]
  );
  const row = result.rows[0];

  return {
    id: row.id,
    needId: row.need_id,
    responsibleUserId: row.responsible_user_id,
    type: row.type,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}
