import { badRequest } from './errors.js';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 200;

/** Lê page e limit da query string, com limites seguros. */
export function parsePagination(query = {}) {
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
    if (!Number.isInteger(page) || page < 1 || page > 100000) {
        throw badRequest('O parâmetro page deve ser um inteiro maior que zero.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw badRequest(`O parâmetro limit deve estar entre 1 e ${MAX_LIMIT}.`);
    }
    return { page, limit, offset: (page - 1) * limit };
}

export function buildPagination({ page, limit }, total) {
    return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
