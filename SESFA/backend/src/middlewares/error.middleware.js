import { normalizeError } from '../utils/errors.js';
import { sendError } from '../utils/responses.js';
import { logger } from '../utils/logger.js';

/** Converte qualquer falha em resposta padronizada, sem vazar detalhes internos. */
export function handleError(request, response, error) {
    const apiError = normalizeError(error);
    if (apiError.statusCode >= 500) {
        logger.error('Falha ao processar requisição.', {
            method: request.method,
            path: (request.url || '').split('?')[0],
            code: error?.code,
            name: error?.name,
        });
    }
    if (response.headersSent) return response.end();
    const headers = apiError.retryAfter ? { 'Retry-After': String(apiError.retryAfter) } : {};
    sendError(response, apiError, headers);
}
