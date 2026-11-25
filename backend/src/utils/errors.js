// Erros de API padronizados e conversão de erros do PostgreSQL.
export class ApiError extends Error {
    constructor(statusCode, message, code = 'ERROR', details = undefined) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

export const badRequest = (message, details) => new ApiError(400, message, 'VALIDATION_ERROR', details);
export const unauthorized = (message = 'Faça login para continuar.') => new ApiError(401, message, 'UNAUTHENTICATED');
export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
    new ApiError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Recurso não encontrado.') => new ApiError(404, message, 'NOT_FOUND');
export const conflict = (message, code = 'CONFLICT', details) => new ApiError(409, message, code, details);

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE']);

/** Converte qualquer erro em ApiError, sem expor detalhes internos. */
export function normalizeError(error) {
    if (error instanceof ApiError) return error;

    const code = error?.code;
    if (code === '23505') return conflict('Já existe um registro com estes dados.', 'DUPLICATE');
    if (code === '23503') {
        return conflict('A operação conflita com registros relacionados.', 'RELATED_RECORDS');
    }
    if (code === '23P01') {
        return conflict('Conflito de horário com outra visita.', 'SCHEDULE_CONFLICT');
    }
    if (code === '23514' || code === '22P02' || code === '22007' || code === '22008') {
        return badRequest('Dados em formato inválido.');
    }
    if (code === '40001' || code === '40P01') {
        return conflict('A operação colidiu com outra em andamento. Tente novamente.', 'RETRY');
    }
    if (code === '57014') return new ApiError(503, 'A consulta demorou demais.', 'TIMEOUT');
    if (
        CONNECTION_CODES.has(code) ||
        (typeof code === 'string' && code.startsWith('08') && code !== '08P01') ||
        code === '57P01' ||
        code === '53300'
    ) {
        return new ApiError(503, 'Serviço temporariamente indisponível.', 'UNAVAILABLE');
    }
    if (error?.message === 'DATABASE_NOT_CONFIGURED') {
        return new ApiError(503, 'Banco de dados não configurado.', 'UNAVAILABLE');
    }
    return new ApiError(500, 'Erro interno. Tente novamente.', 'INTERNAL');
}
