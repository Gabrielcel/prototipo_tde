import { query, withTransaction, advisoryLock } from '../config/database.js';
import { config } from '../config/environment.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { phoneDigits } from '../utils/validators.js';
import { audit } from './audit.service.js';
import { assertFamilyAccess, isManager, volunteerFamilyScope } from './access.service.js';
import { listNeedsForFamily } from './needs.service.js';

const FIELD_LABELS = {
    contact_name: 'Nome do responsável',
    phone: 'Telefone',
    email: 'E-mail',
    street: 'Rua e número',
    neighborhood: 'Bairro',
    city: 'Cidade',
    postal_code: 'CEP',
    occupation: 'Ocupação',
    income_range: 'Renda familiar',
    status: 'Situação',
};

const familyRow = (row) => ({
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
});

const memberRow = (row) => ({
    id: row.id,
    fullName: row.full_name,
    relationship: row.relationship,
    birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
});

const normalizeName = (name) => String(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export async function listFamilies(user, filters, { limit, offset }) {
    const conditions = [];
    const values = [];
    const volunteer = !isManager(user);
    if (volunteer) {
        values.push(user.id);
        conditions.push(volunteerFamilyScope('f.id', `$${values.length}`));
    }
    if (filters.status) {
        values.push(filters.status);
        conditions.push(`f.status = $${values.length}`);
    }
    if (filters.search) {
        values.push(`%${filters.search}%`);
        const like = `$${values.length}`;
        let clause = `f.code ILIKE ${like} OR f.contact_name ILIKE ${like} OR f.neighborhood ILIKE ${like}`;
        const digits = phoneDigits(filters.search);
        if (digits.length >= 4) {
            values.push(`%${digits}%`);
            clause += ` OR REGEXP_REPLACE(COALESCE(f.phone, ''), '\\D', '', 'g') LIKE $${values.length}`;
        }
        conditions.push(`(${clause})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query(`SELECT COUNT(*)::int AS total FROM families f ${where}`, values);

    const nextVisitFilter = volunteer ? `AND v.assigned_to = $1` : '';
    const rows = await query(
        `SELECT f.*,
                (SELECT COUNT(*)::int FROM family_members fm WHERE fm.family_id = f.id) AS member_count,
                (SELECT MIN(v.scheduled_at) FROM visits v
                 WHERE v.family_id = f.id AND v.status IN ('agendada', 'reagendada', 'sem_responsavel')
                   AND v.scheduled_at >= NOW() ${nextVisitFilter}) AS next_visit
         FROM families f ${where}
         ORDER BY f.code
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );
    return {
        total: total.rows[0].total,
        items: rows.rows.map((row) => ({
            ...familyRow(row),
            memberCount: row.member_count,
            nextVisit: row.next_visit,
        })),
    };
}

/** Lista mínima para seletores (agendamento e necessidades). */
export async function familyOptions(user, search) {
    const values = [];
    const conditions = [];
    if (!isManager(user)) {
        values.push(user.id);
        conditions.push(volunteerFamilyScope('f.id', `$${values.length}`));
    }
    if (search) {
        values.push(`%${search}%`);
        conditions.push(`(f.code ILIKE $${values.length} OR f.contact_name ILIKE $${values.length})`);
    }
    const result = await query(
        `SELECT f.id, f.code, f.contact_name, f.neighborhood FROM families f
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY f.code LIMIT 30`,
        values
    );
    return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        contactName: row.contact_name,
        neighborhood: row.neighborhood,
    }));
}

export async function getFamily(user, familyId) {
    await assertFamilyAccess(user, familyId);
    const found = await query('SELECT * FROM families WHERE id = $1', [familyId]);
    const row = found.rows[0];
    if (!row) throw notFound('Família não encontrada.');

    const visitValues = [familyId];
    let visitScope = '';
    if (!isManager(user)) {
        visitValues.push(user.id);
        visitScope = 'AND v.assigned_to = $2';
    }
    const [members, visits, needs] = await Promise.all([
        query(
            `SELECT id, full_name, relationship, birth_date FROM family_members
             WHERE family_id = $1 ORDER BY (relationship = 'Responsável') DESC, created_at, full_name`,
            [familyId]
        ),
        query(
            `SELECT v.id, v.scheduled_at, v.priority, v.status, v.change_reason, u.full_name AS volunteer_name
             FROM visits v LEFT JOIN users u ON u.id = v.assigned_to
             WHERE v.family_id = $1 ${visitScope} ORDER BY v.scheduled_at DESC`,
            visitValues
        ),
        listNeedsForFamily(user, familyId),
    ]);

    const memberList = members.rows.map(memberRow);
    return {
        ...familyRow(row),
        birthDate: memberList.find((member) => member.relationship === 'Responsável')?.birthDate ?? null,
        members: memberList,
        visits: visits.rows.map((visit) => ({
            id: visit.id,
            scheduledAt: visit.scheduled_at,
            priority: visit.priority,
            status: visit.status,
            reason: visit.change_reason,
            volunteerName: visit.volunteer_name,
        })),
        needs,
    };
}

async function findDuplicates(executor, { contactName, phone, excludeId = null }) {
    const digits = phoneDigits(phone);
    const result = await executor.query(
        `SELECT id, code, contact_name, neighborhood, phone FROM families
         WHERE ($3::uuid IS NULL OR id <> $3)
           AND (
             (LENGTH($1) >= 10 AND REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') = $1)
             OR LOWER(contact_name) = LOWER($2)
           )
         ORDER BY code LIMIT 5`,
        [digits, contactName, excludeId]
    );
    return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        contactName: row.contact_name,
        neighborhood: row.neighborhood,
        samePhone: phoneDigits(row.phone) === digits && digits.length >= 10,
    }));
}

async function recordHistory(client, familyId, userId, action, field = null, oldValue = null, newValue = null) {
    await client.query(
        `INSERT INTO family_history (family_id, user_id, action, field, old_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [familyId, userId, action, field, oldValue, newValue]
    );
}

function assertUniqueMembers(members) {
    const seen = new Set();
    for (const member of members) {
        const key = normalizeName(member.fullName);
        if (seen.has(key)) throw badRequest(`Integrante duplicado: ${member.fullName}.`);
        seen.add(key);
    }
}

export async function createFamily(user, data, ip) {
    const members = [
        { fullName: data.contactName, relationship: 'Responsável', birthDate: data.birthDate },
        ...data.members.filter((member) => normalizeName(member.fullName) !== normalizeName(data.contactName)),
    ];
    assertUniqueMembers(members);

    return withTransaction(async (client) => {
        await advisoryLock(client, 'families:create');
        if (!data.confirmDuplicate) {
            const candidates = await findDuplicates(client, data);
            if (candidates.length) {
                throw conflict(
                    'Existe uma família parecida já cadastrada. Revise ou confirme o cadastro.',
                    'POSSIBLE_DUPLICATE',
                    { candidates }
                );
            }
        }
        const next = await client.query(
            `SELECT COALESCE(MAX(code::BIGINT), 0) + 1 AS next_code FROM families WHERE code ~ '^[0-9]{1,15}$'`
        );
        const code = String(next.rows[0].next_code).padStart(4, '0');
        const created = await client.query(
            `INSERT INTO families (code, contact_name, phone, email, street, neighborhood, city, postal_code,
                                   occupation, income_range, status, consent_given, consent_recorded_at,
                                   consent_recorded_by, consent_version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'cadastro_recente',TRUE,NOW(),$11,$12)
             RETURNING *`,
            [
                code,
                data.contactName,
                data.phone,
                data.email,
                data.street,
                data.neighborhood,
                data.city,
                data.postalCode,
                data.occupation,
                data.incomeRange,
                user.id,
                config.business.consentVersion,
            ]
        );
        const family = created.rows[0];
        for (const member of members) {
            await client.query(
                `INSERT INTO family_members (family_id, full_name, relationship, birth_date) VALUES ($1,$2,$3,$4)`,
                [family.id, member.fullName, member.relationship, member.birthDate]
            );
        }
        await recordHistory(client, family.id, user.id, 'cadastro');
        await audit(client, {
            userId: user.id,
            action: 'family.create',
            resourceType: 'family',
            resourceId: family.id,
            ip,
            metadata: { code, members: members.length, duplicateConfirmed: Boolean(data.confirmDuplicate) },
        });
        return familyRow(family);
    });
}

export async function updateFamily(user, familyId, changes, ip) {
    const { birthDate, ...columns } = changes;
    if (!Object.keys(columns).length && birthDate === undefined) {
        throw badRequest('Informe ao menos um campo para atualizar.');
    }
    return withTransaction(async (client) => {
        const current = await client.query('SELECT * FROM families WHERE id = $1 FOR UPDATE', [familyId]);
        const before = current.rows[0];
        if (!before) throw notFound('Família não encontrada.');

        if (columns.contact_name || columns.phone) {
            if (!changes.confirmDuplicate) {
                const candidates = await findDuplicates(client, {
                    contactName: columns.contact_name ?? before.contact_name,
                    phone: columns.phone ?? before.phone,
                    excludeId: familyId,
                });
                const relevant = candidates.filter(
                    (candidate) =>
                        (columns.phone && candidate.samePhone) ||
                        (columns.contact_name &&
                            normalizeName(candidate.contactName) === normalizeName(columns.contact_name))
                );
                if (relevant.length) {
                    throw conflict(
                        'Existe uma família parecida já cadastrada. Revise ou confirme a alteração.',
                        'POSSIBLE_DUPLICATE',
                        { candidates: relevant }
                    );
                }
            }
        }
        delete columns.confirmDuplicate;

        const changed = Object.entries(columns).filter(([column, value]) => (before[column] ?? null) !== value);
        if (changed.length) {
            const assignments = changed.map(([column], index) => `${column} = $${index + 2}`);
            await client.query(`UPDATE families SET ${assignments.join(', ')} WHERE id = $1`, [
                familyId,
                ...changed.map(([, value]) => value),
            ]);
            for (const [column, value] of changed) {
                await recordHistory(
                    client,
                    familyId,
                    user.id,
                    'alteracao',
                    FIELD_LABELS[column],
                    before[column] ?? null,
                    value
                );
            }
            if (columns.contact_name && columns.contact_name !== before.contact_name) {
                await client.query(
                    `UPDATE family_members SET full_name = $2
                     WHERE family_id = $1 AND relationship = 'Responsável'`,
                    [familyId, columns.contact_name]
                );
            }
        }
        if (birthDate !== undefined) {
            const old = await client.query(
                `SELECT birth_date FROM family_members WHERE family_id = $1 AND relationship = 'Responsável'`,
                [familyId]
            );
            const oldDate = old.rows[0]?.birth_date ? String(old.rows[0].birth_date).slice(0, 10) : null;
            if (oldDate !== birthDate) {
                await client.query(
                    `UPDATE family_members SET birth_date = $2 WHERE family_id = $1 AND relationship = 'Responsável'`,
                    [familyId, birthDate]
                );
                await recordHistory(
                    client,
                    familyId,
                    user.id,
                    'alteracao',
                    'Nascimento do responsável',
                    oldDate,
                    birthDate
                );
            }
        }
        await audit(client, {
            userId: user.id,
            action: 'family.update',
            resourceType: 'family',
            resourceId: familyId,
            ip,
            metadata: { fields: changed.map(([column]) => column) },
        });
        const refreshed = await client.query('SELECT * FROM families WHERE id = $1', [familyId]);
        return familyRow(refreshed.rows[0]);
    });
}

export async function listHistory(familyId, { limit, offset }) {
    const exists = await query('SELECT 1 FROM families WHERE id = $1', [familyId]);
    if (!exists.rowCount) throw notFound('Família não encontrada.');
    const total = await query('SELECT COUNT(*)::int AS total FROM family_history WHERE family_id = $1', [familyId]);
    const rows = await query(
        `SELECT h.id, h.action, h.field, h.old_value, h.new_value, h.created_at, u.full_name AS user_name
         FROM family_history h LEFT JOIN users u ON u.id = h.user_id
         WHERE h.family_id = $1 ORDER BY h.created_at DESC, h.id DESC LIMIT $2 OFFSET $3`,
        [familyId, limit, offset]
    );
    return {
        total: total.rows[0].total,
        items: rows.rows.map((row) => ({
            id: row.id,
            action: row.action,
            field: row.field,
            oldValue: row.old_value,
            newValue: row.new_value,
            userName: row.user_name,
            createdAt: row.created_at,
        })),
    };
}

async function lockFamily(client, familyId) {
    const result = await client.query('SELECT id FROM families WHERE id = $1 FOR UPDATE', [familyId]);
    if (!result.rowCount) throw notFound('Família não encontrada.');
}

async function loadMembers(client, familyId) {
    const result = await client.query(
        'SELECT id, full_name, relationship, birth_date FROM family_members WHERE family_id = $1',
        [familyId]
    );
    return result.rows;
}

export async function addMember(user, familyId, member, ip) {
    return withTransaction(async (client) => {
        await lockFamily(client, familyId);
        const members = await loadMembers(client, familyId);
        if (members.length >= 30) throw badRequest('A família pode ter até 30 integrantes.');
        if (members.some((row) => normalizeName(row.full_name) === normalizeName(member.fullName))) {
            throw badRequest(`Integrante duplicado: ${member.fullName}.`);
        }
        const created = await client.query(
            `INSERT INTO family_members (family_id, full_name, relationship, birth_date)
             VALUES ($1,$2,$3,$4) RETURNING id, full_name, relationship, birth_date`,
            [familyId, member.fullName, member.relationship, member.birthDate]
        );
        await recordHistory(
            client,
            familyId,
            user.id,
            'integrante_adicionado',
            'Integrante',
            null,
            `${member.fullName} (${member.relationship})`
        );
        await audit(client, {
            userId: user.id,
            action: 'family.member_add',
            resourceType: 'family',
            resourceId: familyId,
            ip,
        });
        return memberRow(created.rows[0]);
    });
}

export async function updateMember(user, familyId, memberId, changes, ip) {
    return withTransaction(async (client) => {
        await lockFamily(client, familyId);
        const members = await loadMembers(client, familyId);
        const current = members.find((row) => row.id === memberId);
        if (!current) throw notFound('Integrante não encontrado.');
        const isResponsible = current.relationship === 'Responsável';
        if (isResponsible && (changes.fullName || changes.relationship)) {
            throw badRequest('Nome e parentesco do responsável são alterados nos dados da família.');
        }
        if (!isResponsible && changes.relationship === 'Responsável') {
            throw badRequest('A família já possui um responsável.');
        }
        const next = {
            fullName: changes.fullName ?? current.full_name,
            relationship: changes.relationship ?? current.relationship,
            birthDate:
                changes.birthDate !== undefined
                    ? changes.birthDate
                    : current.birth_date
                      ? String(current.birth_date).slice(0, 10)
                      : null,
        };
        if (
            members.some((row) => row.id !== memberId && normalizeName(row.full_name) === normalizeName(next.fullName))
        ) {
            throw badRequest(`Integrante duplicado: ${next.fullName}.`);
        }
        const updated = await client.query(
            `UPDATE family_members SET full_name = $3, relationship = $4, birth_date = $5
             WHERE id = $1 AND family_id = $2 RETURNING id, full_name, relationship, birth_date`,
            [memberId, familyId, next.fullName, next.relationship, next.birthDate]
        );
        await recordHistory(
            client,
            familyId,
            user.id,
            'integrante_alterado',
            'Integrante',
            `${current.full_name} (${current.relationship})`,
            `${next.fullName} (${next.relationship})`
        );
        await audit(client, {
            userId: user.id,
            action: 'family.member_update',
            resourceType: 'family',
            resourceId: familyId,
            ip,
        });
        return memberRow(updated.rows[0]);
    });
}

export async function removeMember(user, familyId, memberId, ip) {
    return withTransaction(async (client) => {
        await lockFamily(client, familyId);
        const members = await loadMembers(client, familyId);
        const current = members.find((row) => row.id === memberId);
        if (!current) throw notFound('Integrante não encontrado.');
        if (current.relationship === 'Responsável')
            throw conflict('O responsável não pode ser removido.', 'RESPONSIBLE_MEMBER');
        await client.query('DELETE FROM family_members WHERE id = $1', [memberId]);
        await recordHistory(
            client,
            familyId,
            user.id,
            'integrante_removido',
            'Integrante',
            `${current.full_name} (${current.relationship})`,
            null
        );
        await audit(client, {
            userId: user.id,
            action: 'family.member_remove',
            resourceType: 'family',
            resourceId: familyId,
            ip,
        });
    });
}
