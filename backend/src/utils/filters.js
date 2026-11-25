import { badRequest } from './errors.js';
import { parseDateOnly, parseEnum, parseText, optionalUuid, parseBoolean } from './validators.js';

export function parseDateRange(query) {
    const from = query.from ? parseDateOnly(query.from, 'Data inicial (from)') : null;
    const to = query.to ? parseDateOnly(query.to, 'Data final (to)') : null;
    if (from && to && from > to) throw badRequest('A data inicial não pode ser posterior à data final.');
    return { from, to };
}

export const parseSearch = (query) => parseText(query.search, { label: 'Busca', max: 100 });
export const optionalEnum = (value, allowed, label) => parseEnum(value, allowed, label, { required: false });
export { optionalUuid, parseBoolean };
