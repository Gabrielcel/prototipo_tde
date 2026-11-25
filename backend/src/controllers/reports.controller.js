import { sendCsv, sendData } from '../utils/responses.js';
import { VISIT_STATUSES } from '../utils/constants.js';
import { optionalEnum, parseDateRange } from '../utils/filters.js';
import { optionalUuid } from '../utils/validators.js';
import { dateInTimezone } from '../utils/dates.js';
import * as reports from '../services/reports.service.js';

const reportFilters = (query) => ({
    ...parseDateRange(query),
    volunteerId: optionalUuid(query.volunteerId, 'voluntário'),
});

export async function summary({ res, user, query }) {
    sendData(res, 200, await reports.getSummary(user, reportFilters(query)));
}

export async function visitsCsv({ res, user, query }) {
    const filters = {
        ...reportFilters(query),
        status: optionalEnum(query.status, [...VISIT_STATUSES, 'abertas'], 'Situação'),
    };
    const content = await reports.exportVisitsCsv(user, filters);
    sendCsv(res, `visitas-${dateInTimezone()}.csv`, content);
}

export async function dashboard({ res, user }) {
    sendData(res, 200, await reports.getDashboard(user));
}
