import { badRequest } from '../utils/errors.js';
import { buildPagination, parsePagination } from '../utils/pagination.js';
import { sendData, sendList } from '../utils/responses.js';
import { FAMILY_STATUSES, INCOME_RANGES, RELATIONSHIPS } from '../utils/constants.js';
import { optionalEnum, parseSearch } from '../utils/filters.js';
import {
    parseBirthDate,
    parseBoolean,
    parseEmail,
    parseEnum,
    parsePersonName,
    parsePhone,
    parsePostalCode,
    parseText,
    requireArray,
    requireUuid,
} from '../utils/validators.js';
import * as families from '../services/families.service.js';

export async function list({ res, user, query }) {
    const pagination = parsePagination(query);
    const filters = {
        status: optionalEnum(query.status, FAMILY_STATUSES, 'Situação'),
        search: parseSearch(query),
    };
    const { items, total } = await families.listFamilies(user, filters, pagination);
    sendList(res, items, buildPagination(pagination, total));
}

export async function options({ res, user, query }) {
    sendData(res, 200, await families.familyOptions(user, parseSearch(query)));
}

export async function get({ res, user, params }) {
    sendData(res, 200, await families.getFamily(user, requireUuid(params.id, 'família')));
}

function parseMember(raw, index) {
    if (!raw || typeof raw !== 'object') throw badRequest(`Integrante ${index + 1}: dados inválidos.`);
    const relationship = parseEnum(raw.relationship, RELATIONSHIPS, 'Parentesco');
    if (relationship === 'Responsável') {
        throw badRequest('O responsável é cadastrado automaticamente; não o inclua entre os integrantes.');
    }
    return {
        fullName: parsePersonName(raw.fullName, 'Nome do integrante'),
        relationship,
        birthDate: parseBirthDate(raw.birthDate, { label: 'Nascimento do integrante' }),
    };
}

function parseFamilyFields(body, partial) {
    const fields = {};
    const present = (key) => !partial || body[key] !== undefined;
    if (present('contactName')) fields.contact_name = parsePersonName(body.contactName, 'Nome do responsável');
    if (present('phone')) fields.phone = parsePhone(body.phone, { required: true });
    if (present('street')) fields.street = parseText(body.street, { label: 'Rua e número', max: 180, required: true });
    if (present('neighborhood'))
        fields.neighborhood = parseText(body.neighborhood, { label: 'Bairro', max: 100, required: true });
    if (present('city')) fields.city = parseText(body.city, { label: 'Cidade', max: 100, required: true });
    if (present('email')) fields.email = parseEmail(body.email);
    if (present('postalCode')) fields.postal_code = parsePostalCode(body.postalCode);
    if (present('occupation')) fields.occupation = parseText(body.occupation, { label: 'Ocupação', max: 100 });
    if (present('incomeRange')) {
        fields.income_range = parseEnum(body.incomeRange ?? 'nao_informado', INCOME_RANGES, 'Renda familiar');
    }
    return fields;
}

export async function create({ res, user, body, ip }) {
    if (body.consentGiven !== true) throw badRequest('O consentimento precisa ser confirmado antes de salvar.');
    const fields = parseFamilyFields(body, false);
    const members = requireArray(body.members, 'A lista de integrantes', { max: 29 }).map(parseMember);
    const data = {
        contactName: fields.contact_name,
        birthDate: parseBirthDate(body.birthDate, { required: true, label: 'Data de nascimento do responsável' }),
        phone: fields.phone,
        email: fields.email,
        street: fields.street,
        neighborhood: fields.neighborhood,
        city: fields.city,
        postalCode: fields.postal_code,
        occupation: fields.occupation,
        incomeRange: fields.income_range,
        members,
        confirmDuplicate: parseBoolean(body.confirmDuplicate, 'confirmDuplicate') === true,
    };
    sendData(res, 201, await families.createFamily(user, data, ip));
}

export async function update({ res, user, params, body, ip }) {
    const id = requireUuid(params.id, 'família');
    const changes = parseFamilyFields(body, true);
    if (body.status !== undefined) changes.status = parseEnum(body.status, FAMILY_STATUSES, 'Situação');
    if (body.birthDate !== undefined) {
        changes.birthDate = parseBirthDate(body.birthDate, {
            required: true,
            label: 'Data de nascimento do responsável',
        });
    }
    if (body.confirmDuplicate === true) changes.confirmDuplicate = true;
    sendData(res, 200, await families.updateFamily(user, id, changes, ip));
}

export async function history({ res, params, query }) {
    const pagination = parsePagination(query);
    const { items, total } = await families.listHistory(requireUuid(params.id, 'família'), pagination);
    sendList(res, items, buildPagination(pagination, total));
}

export async function addMember({ res, user, params, body, ip }) {
    const member = parseMember(body, 0);
    sendData(res, 201, await families.addMember(user, requireUuid(params.id, 'família'), member, ip));
}

export async function updateMember({ res, user, params, body, ip }) {
    const changes = {};
    if (body.fullName !== undefined) changes.fullName = parsePersonName(body.fullName, 'Nome do integrante');
    if (body.relationship !== undefined)
        changes.relationship = parseEnum(body.relationship, RELATIONSHIPS, 'Parentesco');
    if (body.birthDate !== undefined) {
        changes.birthDate = parseBirthDate(body.birthDate, { label: 'Nascimento do integrante' });
    }
    if (!Object.keys(changes).length) throw badRequest('Informe ao menos um campo para atualizar.');
    sendData(
        res,
        200,
        await families.updateMember(
            user,
            requireUuid(params.id, 'família'),
            requireUuid(params.memberId, 'integrante'),
            changes,
            ip
        )
    );
}

export async function removeMember({ res, user, params, ip }) {
    await families.removeMember(
        user,
        requireUuid(params.id, 'família'),
        requireUuid(params.memberId, 'integrante'),
        ip
    );
    sendData(res, 200, { message: 'Integrante removido.' });
}
