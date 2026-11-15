import { ApiError, assertFamilyAccess, isUuid, requireManager } from './access.js';
import { query, withTransaction } from './db.js';

const familyStatuses = ['em_acompanhamento', 'cadastro_recente', 'aguardando_visita'];

function familyInput(data, partial = false) {
  const fields = {
    contactName: ['contact_name', 120],
    phone: ['phone', 30],
    email: ['email', 254],
    street: ['street', 180],
    neighborhood: ['neighborhood', 100],
    city: ['city', 100],
    postalCode: ['postal_code', 12],
    occupation: ['occupation', 100],
    incomeRange: ['income_range', 40],
  };
  const values = {};

  for (const [key, [column, maxLength]] of Object.entries(fields)) {
    if (partial && !(key in data)) continue;
    const value = data[key] == null ? '' : String(data[key]).trim();
    if (value.length > maxLength) throw new ApiError(400, `${key} excede o limite de caracteres.`);
    if (!partial && ['contactName', 'phone', 'street', 'neighborhood', 'city'].includes(key) && !value) {
      throw new ApiError(400, 'Preencha os dados obrigatórios da família.');
    }
    if (key === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new ApiError(400, 'Informe um e-mail válido.');
    }
    values[column] = value || null;
  }

  if (partial && 'status' in data) {
    if (!familyStatuses.includes(data.status)) throw new ApiError(400, 'Situação familiar inválida.');
    values.status = data.status;
  }

  return values;
}

function memberInput(data, contactName, birthDate) {
  if (data.members != null && !Array.isArray(data.members)) {
    throw new ApiError(400, 'A lista de integrantes deve ser um array.');
  }

  const members = (data.members || []).map(member => {
    const fullName = typeof member.fullName === 'string' ? member.fullName.trim() : '';
    const relationship = typeof member.relationship === 'string' ? member.relationship.trim() : '';
    const date = member.birthDate || null;

    if (!fullName || fullName.length > 120 || !relationship || relationship.length > 40) {
      throw new ApiError(400, 'Confira o nome e o parentesco de cada integrante.');
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ApiError(400, 'Use uma data de nascimento válida.');
    }

    return { fullName, relationship, birthDate: date };
  });

  if (members.length > 30) throw new ApiError(400, 'A família pode ter até 30 integrantes por cadastro.');
  if (!members.some(member => member.fullName.toLowerCase() === contactName.toLowerCase())) {
    members.unshift({ fullName: contactName, relationship: 'Responsável', birthDate });
  }

  return members;
}

function familyRow(row) {
  return {
    id: row.id,
    code: row.code,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    street: row.street,
    neighborhood: row.neighborhood,
    city: row.city,
    postalCode: row.postal_code,
    occupation: row.occupation,
    incomeRange: row.income_range,
    status: row.status,
    consentGiven: row.consent_given,
    consentRecordedAt: row.consent_recorded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFamilies(user, filters = {}) {
  const conditions = [];
  const values = [];

  if (user.role !== 'gestor') {
    values.push(user.id);
    conditions.push(
      `EXISTS (SELECT 1 FROM visits v WHERE v.family_id = f.id AND v.assigned_to = $${values.length})`
    );
  }
  if (filters.status) {
    if (!familyStatuses.includes(filters.status)) throw new ApiError(400, 'Filtro de situação inválido.');
    values.push(filters.status);
    conditions.push(`f.status = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(`(f.code ILIKE $${values.length} OR f.contact_name ILIKE $${values.length} OR f.neighborhood ILIKE $${values.length})`);
  }

  const result = await query(
    `SELECT f.*,
            (SELECT COUNT(*)::int FROM family_members fm WHERE fm.family_id = f.id) AS member_count,
            (SELECT MIN(v.scheduled_at) FROM visits v
             WHERE v.family_id = f.id AND v.status IN ('agendada', 'reagendada', 'sem_responsavel')
               AND v.scheduled_at >= NOW()) AS next_visit
     FROM families f
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY f.code`,
    values
  );

  return result.rows.map(row => ({ ...familyRow(row), memberCount: row.member_count, nextVisit: row.next_visit }));
}

export async function getFamily(user, familyId) {
  if (!isUuid(familyId)) throw new ApiError(400, 'Identificador de família inválido.');
  await assertFamilyAccess(user, familyId);

  const result = await query('SELECT * FROM families WHERE id = $1', [familyId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'Família não encontrada.');

  const [members, visits, needs] = await Promise.all([
    query(
      `SELECT id, full_name, relationship, birth_date
       FROM family_members WHERE family_id = $1 ORDER BY created_at, full_name`,
      [familyId]
    ),
    query(
      `SELECT v.id, v.scheduled_at, v.priority, v.status, v.change_reason,
              u.full_name AS volunteer_name
       FROM visits v LEFT JOIN users u ON u.id = v.assigned_to
       WHERE v.family_id = $1 ORDER BY v.scheduled_at DESC`,
      [familyId]
    ),
    query(
      `SELECT n.id, n.category, n.description, n.priority, n.status, n.created_at,
              COALESCE(json_agg(json_build_object(
                'id', r.id, 'type', r.type, 'status', r.status, 'description', r.description
              )) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS referrals
       FROM needs n LEFT JOIN referrals r ON r.need_id = n.id
       WHERE n.family_id = $1
       GROUP BY n.id ORDER BY n.created_at DESC`,
      [familyId]
    ),
  ]);

  return {
    ...familyRow(row),
    members: members.rows.map(member => ({
      id: member.id,
      fullName: member.full_name,
      relationship: member.relationship,
      birthDate: member.birth_date,
    })),
    visits: visits.rows.map(visit => ({
      id: visit.id,
      scheduledAt: visit.scheduled_at,
      priority: visit.priority,
      status: visit.status,
      reason: visit.change_reason,
      volunteerName: visit.volunteer_name,
    })),
    needs: needs.rows.map(need => ({
      id: need.id,
      category: need.category,
      description: need.description,
      priority: need.priority,
      status: need.status,
      createdAt: need.created_at,
      referrals: need.referrals,
    })),
  };
}

export async function createFamily(user, data) {
  requireManager(user);
  const values = familyInput(data);
  const contactName = values.contact_name;
  const birthDate = data.birthDate || null;
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new ApiError(400, 'Use uma data de nascimento válida.');
  }
  if (data.consentGiven !== true) {
    throw new ApiError(400, 'O consentimento precisa ser confirmado antes de salvar.');
  }
  const members = memberInput(data, contactName, birthDate);

  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(73190215)');
    const nextCode = await client.query(
      `SELECT COALESCE(MAX(code::BIGINT), 0) + 1 AS next_code
       FROM families WHERE code ~ '^[0-9]+$'`
    );
    const code = String(nextCode.rows[0].next_code).padStart(4, '0');
    const family = await client.query(
      `INSERT INTO families (
         code, contact_name, phone, email, street, neighborhood, city, postal_code,
         occupation, income_range, status, consent_given, consent_recorded_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'cadastro_recente',TRUE,NOW())
       RETURNING *`,
      [
        code,
        values.contact_name,
        values.phone,
        values.email,
        values.street,
        values.neighborhood,
        values.city,
        values.postal_code,
        values.occupation,
        values.income_range,
      ]
    );

    for (const member of members) {
      await client.query(
        `INSERT INTO family_members (family_id, full_name, relationship, birth_date)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (family_id, full_name, relationship) DO NOTHING`,
        [family.rows[0].id, member.fullName, member.relationship, member.birthDate]
      );
    }

    return familyRow(family.rows[0]);
  });
}

export async function updateFamily(user, familyId, data) {
  requireManager(user);
  if (!isUuid(familyId)) throw new ApiError(400, 'Identificador de família inválido.');
  const values = familyInput(data, true);
  if (!Object.keys(values).length) throw new ApiError(400, 'Informe ao menos um campo para atualizar.');

  const columns = Object.keys(values);
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
  const result = await query(
    `UPDATE families
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [familyId, ...Object.values(values)]
  );

  if (!result.rows[0]) throw new ApiError(404, 'Família não encontrada.');
  return familyRow(result.rows[0]);
}
