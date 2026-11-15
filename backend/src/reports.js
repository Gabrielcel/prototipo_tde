import { ApiError, isUuid } from './access.js';
import { query } from './db.js';

function reportDate(value, name) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `O filtro ${name} deve usar o formato AAAA-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `O filtro ${name} contém uma data inválida.`);
  }
  return value;
}

function filtersFor(user, filters) {
  const from = reportDate(filters.from, 'from');
  const to = reportDate(filters.to, 'to');
  if (from && to && from > to) throw new ApiError(400, 'A data inicial não pode ser posterior à final.');

  let volunteerId = null;
  if (user.role === 'gestor') {
    if (filters.volunteerId) {
      if (!isUuid(filters.volunteerId)) throw new ApiError(400, 'Identificador de voluntário inválido.');
      volunteerId = filters.volunteerId;
    }
  } else {
    if (filters.volunteerId && filters.volunteerId !== user.id) {
      throw new ApiError(403, 'O relatório de voluntário mostra apenas suas visitas.');
    }
    volunteerId = user.id;
  }

  return { from, to, volunteerId };
}

function dateConditions(alias, column, range, values) {
  const conditions = [];
  if (range.from) {
    values.push(range.from);
    conditions.push(`${alias}.${column} >= $${values.length}::date`);
  }
  if (range.to) {
    values.push(range.to);
    conditions.push(`${alias}.${column} < $${values.length}::date + INTERVAL '1 day'`);
  }
  return conditions;
}

async function countsByStatus(table, alias, dateColumn, range, scope, scopeType) {
  const values = [];
  const conditions = dateConditions(alias, dateColumn, range, values);

  if (scope.volunteerId) {
    values.push(scope.volunteerId);
    const param = `$${values.length}`;
    if (scopeType === 'visit') {
      conditions.push(`${alias}.assigned_to = ${param}`);
    } else if (scopeType === 'need') {
      conditions.push(
        `EXISTS (SELECT 1 FROM visits v WHERE v.id = ${alias}.visit_id AND v.assigned_to = ${param})`
      );
    } else {
      conditions.push(
        `EXISTS (SELECT 1 FROM needs n JOIN visits v ON v.id = n.visit_id
         WHERE n.id = ${alias}.need_id AND v.assigned_to = ${param})`
      );
    }
  }

  const result = await query(
    `SELECT ${alias}.status, COUNT(*)::int AS total
     FROM ${table} ${alias}
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY ${alias}.status
     ORDER BY ${alias}.status`,
    values
  );
  const byStatus = Object.fromEntries(result.rows.map(row => [row.status, row.total]));

  return {
    total: result.rows.reduce((total, row) => total + row.total, 0),
    byStatus,
  };
}

export async function getSummaryReport(user, filters = {}) {
  const range = filtersFor(user, filters);
  const [visits, needs, referrals] = await Promise.all([
    countsByStatus('visits', 'v', 'scheduled_at', range, range, 'visit'),
    countsByStatus('needs', 'n', 'created_at', range, range, 'need'),
    countsByStatus('referrals', 'r', 'created_at', range, range, 'referral'),
  ]);

  return {
    filters: {
      from: range.from,
      to: range.to,
      volunteerId: range.volunteerId,
    },
    visits,
    needs,
    referrals,
  };
}
