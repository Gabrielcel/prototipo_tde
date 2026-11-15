import { query } from './db.js';

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const isUuid = value =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');

export function requireManager(user) {
  if (user.role !== 'gestor') {
    throw new ApiError(403, 'Esta ação está disponível somente para gestores.');
  }
}

export async function assertFamilyAccess(user, familyId, client = { query }) {
  if (user.role === 'gestor') return;

  const result = await client.query(
    `SELECT 1 FROM visits
     WHERE family_id = $1 AND assigned_to = $2
     LIMIT 1`,
    [familyId, user.id]
  );

  if (!result.rowCount) throw new ApiError(404, 'Família não encontrada.');
}

export async function assertVisitAccess(user, visitId, client = { query }) {
  const result = await client.query(
    `SELECT id, family_id, assigned_to, status
     FROM visits
     WHERE id = $1`,
    [visitId]
  );
  const visit = result.rows[0];

  if (!visit || (user.role !== 'gestor' && visit.assigned_to !== user.id)) {
    throw new ApiError(404, 'Visita não encontrada.');
  }

  return visit;
}

export async function ensureActiveVolunteer(userId, client = { query }) {
  if (!isUuid(userId)) throw new ApiError(400, 'Identificador de voluntário inválido.');

  const result = await client.query(
    `SELECT id FROM users
     WHERE id = $1 AND role = 'voluntario' AND status = 'ativo'`,
    [userId]
  );

  if (!result.rowCount) throw new ApiError(400, 'Selecione um voluntário ativo.');
}
