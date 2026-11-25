import { config } from '../config/environment.js';
import { checkDatabase } from '../config/database.js';
import { sendData, sendJson, sendList } from '../utils/responses.js';
import { buildPagination, parsePagination } from '../utils/pagination.js';
import * as constants from '../utils/constants.js';
import { optionalUuid } from '../utils/validators.js';
import { listAuditLogs } from '../services/audit.service.js';

export function health({ res }) {
    sendJson(res, 200, { status: 'ok' });
}

export async function healthDatabase({ res }) {
    try {
        await checkDatabase();
        sendJson(res, 200, { status: 'ok' });
    } catch {
        sendJson(res, 503, { status: 'unavailable' });
    }
}

/** Valores de referência para a interface (sem dados sensíveis). */
export function meta({ res }) {
    sendData(res, 200, {
        timezone: config.timezone,
        visitMinIntervalMinutes: config.business.visitMinIntervalMinutes,
        priorities: constants.PRIORITIES,
        relationships: constants.RELATIONSHIPS,
        incomeRanges: constants.INCOME_RANGES,
        needCategories: constants.NEED_CATEGORIES,
        checklistItems: constants.CHECKLIST_ITEMS,
        checklistAnswers: constants.CHECKLIST_ANSWERS,
        needTransitions: constants.NEED_TRANSITIONS,
        referralTransitions: constants.REFERRAL_TRANSITIONS,
    });
}

export async function auditLogs({ res, query }) {
    const pagination = parsePagination(query);
    const filters = {
        action: typeof query.action === 'string' ? query.action.slice(0, 60) : null,
        userId: optionalUuid(query.userId, 'usuário'),
    };
    const { items, total } = await listAuditLogs(pagination, filters);
    sendList(res, items, buildPagination(pagination, total));
}
