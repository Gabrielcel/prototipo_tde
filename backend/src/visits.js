import {
  ApiError,
  ensureActiveVolunteer,
  isUuid,
  requireManager,
} from './access.js';
import { query, withTransaction } from './db.js';

const priorities = ['alta', 'media', 'baixa'];
const openStatuses = ['agendada', 'reagendada', 'sem_responsavel'];
const visitStatuses = [...openStatuses, 'concluida', 'cancelada'];

function priorityValue(value) {
  const priority = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!priorities.includes(priority)) throw new ApiError(400, 'Prioridade de visita inválida.');
  return priority;
}

function scheduledAtValue(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new ApiError(400, 'Informe a data e o horário da visita com fuso horário.');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Data e horário inválidos.');
  if (date.getTime() < Date.now()) throw new ApiError(400, 'A visita precisa ser marcada para o futuro.');
  return date.toISOString();
}

function optionalDate(value, fieldName) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `O filtro ${fieldName} deve usar o formato AAAA-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `O filtro ${fieldName} contém uma data inválida.`);
  }
  return value;
}

function visitRow(row) {
  return {
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
  };
}

async function loadVisit(executor, visitId) {
  const result = await executor.query(
    `SELECT v.*, f.code AS family_code, f.contact_name, f.neighborhood,
            u.full_name AS volunteer_name
     FROM visits v
     JOIN families f ON f.id = v.family_id
     LEFT JOIN users u ON u.id = v.assigned_to
     WHERE v.id = $1`,
    [visitId]
  );

  return result.rows[0] || null;
}

async function assertNoConflict(executor, familyId, assignedTo, scheduledAt, visitId = null) {
  const familyConflict = await executor.query(
    `SELECT 1 FROM visits
     WHERE family_id = $1
       AND status = ANY($2::varchar[])
       AND scheduled_at > $3::timestamptz - INTERVAL '1 hour'
       AND scheduled_at < $3::timestamptz + INTERVAL '1 hour'
       AND ($4::uuid IS NULL OR id <> $4)
     LIMIT 1`,
    [familyId, openStatuses, scheduledAt, visitId]
  );
  if (familyConflict.rowCount) throw new ApiError(409, 'A família já tem uma visita próxima desse horário.');

  if (assignedTo) {
    const volunteerConflict = await executor.query(
      `SELECT 1 FROM visits
       WHERE assigned_to = $1
         AND status = ANY($2::varchar[])
         AND scheduled_at > $3::timestamptz - INTERVAL '1 hour'
         AND scheduled_at < $3::timestamptz + INTERVAL '1 hour'
         AND ($4::uuid IS NULL OR id <> $4)
       LIMIT 1`,
      [assignedTo, openStatuses, scheduledAt, visitId]
    );
    if (volunteerConflict.rowCount) {
      throw new ApiError(409, 'O voluntário já tem uma visita próxima desse horário.');
    }
  }
}

export async function listVisits(user, filters = {}) {
  const conditions = [];
  const values = [];

  if (user.role !== 'gestor') {
    values.push(user.id);
    conditions.push(`v.assigned_to = $${values.length}`);
  } else if (filters.volunteerId) {
    if (!isUuid(filters.volunteerId)) throw new ApiError(400, 'Identificador de voluntário inválido.');
    values.push(filters.volunteerId);
    conditions.push(`v.assigned_to = $${values.length}`);
  }

  if (filters.status) {
    const status = filters.status.toLowerCase();
    if (!visitStatuses.includes(status)) throw new ApiError(400, 'Filtro de situação inválido.');
    values.push(status);
    conditions.push(`v.status = $${values.length}`);
  }

  const from = optionalDate(filters.from, 'from');
  const to = optionalDate(filters.to, 'to');
  if (from && to && from > to) throw new ApiError(400, 'A data inicial não pode ser posterior à data final.');
  if (from) {
    values.push(from);
    conditions.push(`v.scheduled_at >= $${values.length}::date`);
  }
  if (to) {
    values.push(to);
    conditions.push(`v.scheduled_at < $${values.length}::date + INTERVAL '1 day'`);
  }

  const result = await query(
    `SELECT v.*, f.code AS family_code, f.contact_name, f.neighborhood,
            u.full_name AS volunteer_name
     FROM visits v
     JOIN families f ON f.id = v.family_id
     LEFT JOIN users u ON u.id = v.assigned_to
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY v.scheduled_at`,
    values
  );

  return result.rows.map(visitRow);
}

export async function getVisit(user, visitId) {
  if (!isUuid(visitId)) throw new ApiError(400, 'Identificador de visita inválido.');
  const visit = await loadVisit({ query }, visitId);
  if (!visit || (user.role !== 'gestor' && visit.assigned_to !== user.id)) {
    throw new ApiError(404, 'Visita não encontrada.');
  }

  const record = await query(
    `SELECT conditions, observations, checklist_answers, completed_at
     FROM visit_records WHERE visit_id = $1`,
    [visitId]
  );

  return { ...visitRow(visit), record: record.rows[0] || null };
}

export async function createVisit(user, data) {
  requireManager(user);
  if (!isUuid(data.familyId)) throw new ApiError(400, 'Selecione uma família válida.');
  const scheduledAt = scheduledAtValue(data.scheduledAt);
  const priority = priorityValue(data.priority);
  const assignedTo = data.assignedTo || null;
  if (assignedTo) await ensureActiveVolunteer(assignedTo);

  return withTransaction(async client => {
    const family = await client.query('SELECT id FROM families WHERE id = $1', [data.familyId]);
    if (!family.rowCount) throw new ApiError(404, 'Família não encontrada.');

    await assertNoConflict(client, data.familyId, assignedTo, scheduledAt);
    const result = await client.query(
      `INSERT INTO visits (family_id, assigned_to, created_by, scheduled_at, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [data.familyId, assignedTo, user.id, scheduledAt, priority, assignedTo ? 'agendada' : 'sem_responsavel']
    );

    return visitRow(await loadVisit(client, result.rows[0].id));
  });
}

export async function updateVisit(user, visitId, data) {
  requireManager(user);
  if (!isUuid(visitId)) throw new ApiError(400, 'Identificador de visita inválido.');

  return withTransaction(async client => {
    const current = await client.query('SELECT * FROM visits WHERE id = $1 FOR UPDATE', [visitId]);
    const visit = current.rows[0];
    if (!visit) throw new ApiError(404, 'Visita não encontrada.');
    if (['concluida', 'cancelada'].includes(visit.status)) {
      throw new ApiError(409, 'Esta visita já foi encerrada.');
    }

    const scheduledAt = data.scheduledAt ? scheduledAtValue(data.scheduledAt) : visit.scheduled_at;
    const assignedTo = 'assignedTo' in data ? data.assignedTo || null : visit.assigned_to;
    const priority = data.priority ? priorityValue(data.priority) : visit.priority;
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    let status = visit.status;

    if (assignedTo) await ensureActiveVolunteer(assignedTo, client);
    if (data.status && data.status !== 'cancelada') {
      throw new ApiError(400, 'A visita só pode ser encerrada pelo registro completo da visita.');
    }

    if (data.status === 'cancelada') {
      if (!reason) throw new ApiError(400, 'Informe o motivo do cancelamento.');
      status = 'cancelada';
    } else if (data.scheduledAt) {
      if (!reason) throw new ApiError(400, 'Informe o motivo do reagendamento.');
      status = assignedTo ? 'reagendada' : 'sem_responsavel';
    } else if ('assignedTo' in data) {
      status = assignedTo ? 'agendada' : 'sem_responsavel';
    }

    if (status !== 'cancelada') {
      await assertNoConflict(client, visit.family_id, assignedTo, scheduledAt, visitId);
    }

    await client.query(
      `UPDATE visits
       SET scheduled_at = $2, assigned_to = $3, priority = $4, status = $5,
           change_reason = CASE WHEN $6 = '' THEN change_reason ELSE $6 END,
           updated_at = NOW()
       WHERE id = $1`,
      [visitId, scheduledAt, assignedTo, priority, status, reason]
    );

    return visitRow(await loadVisit(client, visitId));
  });
}

function recordNeeds(data) {
  if (data.needs != null && !Array.isArray(data.needs)) {
    throw new ApiError(400, 'As necessidades devem ser enviadas em uma lista.');
  }

  const referralTypes = ['encaminhamento', 'pendencia'];
  return (data.needs || []).map(item => {
    const category = typeof item.category === 'string' ? item.category.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const priority = typeof item.priority === 'string' ? item.priority.trim().toLowerCase() : '';
    if (!category || category.length > 60 || !description || description.length > 2000) {
      throw new ApiError(400, 'Confira o tipo e a descrição de cada necessidade.');
    }
    if (!priorities.includes(priority)) throw new ApiError(400, 'Prioridade de necessidade inválida.');
    let referral = null;
    if (item.referral) {
      const type = typeof item.referral.type === 'string' ? item.referral.type.trim().toLowerCase() : '';
      const responsibleUserId = item.referral.responsibleUserId;
      if (!referralTypes.includes(type) || !isUuid(responsibleUserId)) {
        throw new ApiError(400, 'Confira o tipo e a pessoa responsável pelo encaminhamento.');
      }
      referral = { type, responsibleUserId };
    }
    return { category, description, priority, referral };
  });
}

export async function registerVisit(user, visitId, data) {
  if (!isUuid(visitId)) throw new ApiError(400, 'Identificador de visita inválido.');
  const answers = data.checklistAnswers;
  if (!Array.isArray(answers) || answers.length !== 6) {
    throw new ApiError(400, 'O checklist precisa conter as seis respostas da visita.');
  }

  const validAnswers = answers.map(answer => {
    if (
      !answer ||
      typeof answer.item !== 'string' ||
      !['Sim', 'Não', 'Não se aplica'].includes(answer.answer)
    ) {
      throw new ApiError(400, 'Confira as respostas do checklist.');
    }
    return { item: answer.item.slice(0, 180), answer: answer.answer };
  });
  const conditions = typeof data.conditions === 'string' ? data.conditions.trim() : '';
  const observations = typeof data.observations === 'string' ? data.observations.trim() : '';
  if (conditions.length > 4000 || observations.length > 4000) {
    throw new ApiError(400, 'As observações não podem exceder 4.000 caracteres.');
  }
  const needs = recordNeeds(data);
  if (needs.length > 20) throw new ApiError(400, 'Registre até 20 necessidades por visita.');

  return withTransaction(async client => {
    const result = await client.query('SELECT * FROM visits WHERE id = $1 FOR UPDATE', [visitId]);
    const visit = result.rows[0];
    if (!visit || (user.role !== 'gestor' && visit.assigned_to !== user.id)) {
      throw new ApiError(404, 'Visita não encontrada.');
    }
    if (!openStatuses.includes(visit.status)) throw new ApiError(409, 'A visita não está aberta para registro.');

    await client.query(
      `INSERT INTO visit_records (visit_id, completed_by, conditions, observations, checklist_answers)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [visitId, user.id, conditions || null, observations || null, JSON.stringify(validAnswers)]
    );
    await client.query(
      `UPDATE visits SET status = 'concluida', updated_at = NOW() WHERE id = $1`,
      [visitId]
    );

    const createdNeeds = [];
    for (const need of needs) {
      const created = await client.query(
        `INSERT INTO needs (family_id, visit_id, created_by, category, description, priority)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [visit.family_id, visitId, user.id, need.category, need.description, need.priority]
      );
      createdNeeds.push(created.rows[0]);
      if (need.referral) {
        await ensureActiveVolunteer(need.referral.responsibleUserId, client);
        await client.query(
          `INSERT INTO referrals (need_id, responsible_user_id, type)
           VALUES ($1,$2,$3)`,
          [created.rows[0].id, need.referral.responsibleUserId, need.referral.type]
        );
      }
    }

    return { visitId, status: 'concluida', needsCreated: needs.length, needs: createdNeeds };
  });
}
