import { badRequest } from '../utils/errors.js';
import { buildPagination, parsePagination } from '../utils/pagination.js';
import { sendData, sendList } from '../utils/responses.js';
import { NEED_CATEGORIES, NEED_STATUSES, PRIORITIES, REFERRAL_STATUSES, REFERRAL_TYPES } from '../utils/constants.js';
import { optionalEnum, parseBoolean } from '../utils/filters.js';
import { optionalUuid, parseEnum, parseText, requireUuid } from '../utils/validators.js';
import * as needs from '../services/needs.service.js';

export async function list({ res, user, query }) {
    const pagination = parsePagination(query);
    const filters = {
        status: optionalEnum(query.status, NEED_STATUSES, 'Situação'),
        priority: optionalEnum(query.priority, PRIORITIES, 'Prioridade'),
        category: optionalEnum(query.category, NEED_CATEGORIES, 'Categoria'),
        familyId: optionalUuid(query.familyId, 'família'),
        hasReferral: parseBoolean(query.hasReferral, 'hasReferral'),
    };
    const { items, total } = await needs.listNeeds(user, filters, pagination);
    sendList(res, items, buildPagination(pagination, total));
}

export async function get({ res, user, params }) {
    sendData(res, 200, await needs.getNeed(user, requireUuid(params.id, 'necessidade')));
}

const descriptionOf = (value) =>
    parseText(value, { label: 'a descrição da necessidade', max: 2000, required: true, multiline: true });

export async function create({ res, user, body, ip }) {
    const data = {
        familyId: requireUuid(body.familyId, 'família'),
        visitId: optionalUuid(body.visitId, 'visita'),
        category: parseEnum(body.category, NEED_CATEGORIES, 'Categoria'),
        description: descriptionOf(body.description),
        priority: parseEnum(body.priority, PRIORITIES, 'Prioridade'),
    };
    sendData(res, 201, await needs.createNeed(user, data, ip));
}

export async function update({ res, user, params, body, ip }) {
    const changes = {};
    if (body.category !== undefined) changes.category = parseEnum(body.category, NEED_CATEGORIES, 'Categoria');
    if (body.description !== undefined) changes.description = descriptionOf(body.description);
    if (body.priority !== undefined) changes.priority = parseEnum(body.priority, PRIORITIES, 'Prioridade');
    if (body.status !== undefined) changes.status = parseEnum(body.status, NEED_STATUSES, 'Situação');
    if (!Object.keys(changes).length) throw badRequest('Informe ao menos um campo para atualizar.');
    sendData(res, 200, await needs.updateNeed(user, requireUuid(params.id, 'necessidade'), changes, ip));
}

export async function createReferral({ res, user, params, body, ip }) {
    const data = {
        type: parseEnum(body.type, REFERRAL_TYPES, 'Tipo de encaminhamento'),
        responsibleUserId: optionalUuid(body.responsibleUserId, 'responsável'),
        description: parseText(body.description, { label: 'Descrição', max: 2000, multiline: true }),
    };
    sendData(res, 201, await needs.createReferral(user, requireUuid(params.id, 'necessidade'), data, ip));
}

export async function listReferrals({ res, user, query }) {
    const pagination = parsePagination(query);
    const filters = {
        status: optionalEnum(query.status, REFERRAL_STATUSES, 'Situação'),
        type: optionalEnum(query.type, REFERRAL_TYPES, 'Tipo'),
        needId: optionalUuid(query.needId, 'necessidade'),
        responsibleId: optionalUuid(query.responsibleId, 'responsável'),
        mine: parseBoolean(query.mine, 'mine') === true,
    };
    const { items, total } = await needs.listReferrals(user, filters, pagination);
    sendList(res, items, buildPagination(pagination, total));
}

export async function updateReferral({ res, user, params, body, ip }) {
    const changes = {};
    if (body.status !== undefined) changes.status = parseEnum(body.status, REFERRAL_STATUSES, 'Situação');
    if (body.responsibleUserId !== undefined)
        changes.responsibleUserId = optionalUuid(body.responsibleUserId, 'responsável');
    if (body.description !== undefined) {
        changes.description = parseText(body.description, { label: 'Descrição', max: 2000, multiline: true });
    }
    if (!Object.keys(changes).length) throw badRequest('Informe ao menos um campo para atualizar.');
    sendData(res, 200, await needs.updateReferral(user, requireUuid(params.id, 'encaminhamento'), changes, ip));
}
