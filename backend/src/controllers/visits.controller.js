import { badRequest } from '../utils/errors.js';
import { buildPagination, parsePagination } from '../utils/pagination.js';
import { sendData, sendList } from '../utils/responses.js';
import {
    CHECKLIST_ANSWERS,
    CHECKLIST_ITEMS,
    NEED_CATEGORIES,
    PRIORITIES,
    REFERRAL_TYPES,
    VISIT_STATUSES,
} from '../utils/constants.js';
import { optionalEnum, parseDateRange } from '../utils/filters.js';
import { optionalUuid, parseEnum, parseInstant, parseText, requireArray, requireUuid } from '../utils/validators.js';
import * as visits from '../services/visits.service.js';

export async function list({ res, user, query }) {
    const pagination = parsePagination(query);
    const filters = {
        status: optionalEnum(query.status, [...VISIT_STATUSES, 'abertas'], 'Situação'),
        volunteerId: optionalUuid(query.volunteerId, 'voluntário'),
        familyId: optionalUuid(query.familyId, 'família'),
        order: optionalEnum(query.order, ['asc', 'desc'], 'Ordem'),
        ...parseDateRange(query),
    };
    const { items, total } = await visits.listVisits(user, filters, pagination);
    sendList(res, items, buildPagination(pagination, total));
}

export async function get({ res, user, params }) {
    sendData(res, 200, await visits.getVisit(user, requireUuid(params.id, 'visita')));
}

export async function create({ res, user, body, ip }) {
    const data = {
        familyId: requireUuid(body.familyId, 'família'),
        scheduledAt: parseInstant(body.scheduledAt, { future: true }),
        priority: parseEnum(body.priority, PRIORITIES, 'Prioridade'),
        assignedTo: optionalUuid(body.assignedTo, 'voluntário'),
    };
    sendData(res, 201, await visits.createVisit(user, data, ip));
}

export async function update({ res, user, params, body, ip }) {
    const changes = {};
    if (body.scheduledAt !== undefined) changes.scheduledAt = parseInstant(body.scheduledAt, { future: true });
    if (body.assignedTo !== undefined) changes.assignedTo = optionalUuid(body.assignedTo, 'voluntário');
    if (body.priority !== undefined) changes.priority = parseEnum(body.priority, PRIORITIES, 'Prioridade');
    if (body.status !== undefined) {
        if (body.status !== 'cancelada') {
            throw badRequest('A visita só pode ser encerrada pelo registro completo da visita.');
        }
        changes.status = 'cancelada';
    }
    if (body.reason !== undefined)
        changes.reason = parseText(body.reason, { label: 'Motivo', max: 1000, multiline: true });
    sendData(res, 200, await visits.updateVisit(user, requireUuid(params.id, 'visita'), changes, ip));
}

function parseChecklist(value) {
    const list = requireArray(value, 'O checklist', { max: CHECKLIST_ITEMS.length });
    if (list.length !== CHECKLIST_ITEMS.length) {
        throw badRequest(`O checklist precisa conter as ${CHECKLIST_ITEMS.length} respostas da visita.`);
    }
    const answers = new Map();
    for (const entry of list) {
        if (!entry || !CHECKLIST_ITEMS.includes(entry.item) || answers.has(entry.item)) {
            throw badRequest('Confira os itens do checklist.');
        }
        answers.set(entry.item, parseEnum(entry.answer, CHECKLIST_ANSWERS, 'Resposta do checklist'));
    }
    return CHECKLIST_ITEMS.map((item) => ({ item, answer: answers.get(item) }));
}

function parseNeedEntry(raw) {
    if (!raw || typeof raw !== 'object') throw badRequest('Confira as necessidades informadas.');
    const referrals = requireArray(raw.referrals, 'Os encaminhamentos', { max: 5 }).map((item) => {
        if (!item || typeof item !== 'object') throw badRequest('Confira os encaminhamentos informados.');
        return {
            type: parseEnum(item.type, REFERRAL_TYPES, 'Tipo de encaminhamento'),
            responsibleUserId: requireUuid(item.responsibleUserId, 'responsável'),
            description: parseText(item.description, {
                label: 'Descrição do encaminhamento',
                max: 2000,
                multiline: true,
            }),
        };
    });
    return {
        category: parseEnum(raw.category, NEED_CATEGORIES, 'Categoria da necessidade'),
        description: parseText(raw.description, {
            label: 'a descrição da necessidade',
            max: 2000,
            required: true,
            multiline: true,
        }),
        priority: parseEnum(raw.priority, PRIORITIES, 'Prioridade da necessidade'),
        referrals,
    };
}

export async function register({ res, user, params, body, ip }) {
    const data = {
        checklist: parseChecklist(body.checklistAnswers),
        conditions: parseText(body.conditions, { label: 'Condições observadas', max: 4000, multiline: true }),
        observations: parseText(body.observations, { label: 'Observações', max: 4000, multiline: true }),
        needs: requireArray(body.needs, 'A lista de necessidades', { max: 20 }).map(parseNeedEntry),
    };
    sendData(res, 201, await visits.registerVisit(user, requireUuid(params.id, 'visita'), data, ip));
}
