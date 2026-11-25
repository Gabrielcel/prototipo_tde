// Comunicação com a API: timeout, CSRF, tratamento de 401 e erros padronizados.
import { API_BASE, REQUEST_TIMEOUT_MS } from '../core/config.js';
import { getState } from '../core/state.js';

export class ApiError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

let unauthorizedHandler = () => {};
export const onUnauthorized = (handler) => {
    unauthorizedHandler = handler;
};

const PUBLIC_PATHS = ['/auth/login', '/auth/bootstrap', '/auth/status', '/auth/me', '/meta'];

function buildUrl(path, query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null && value !== '') params.set(key, value);
    }
    const text = params.toString();
    return `${API_BASE}${path}${text ? `?${text}` : ''}`;
}

async function send(method, path, { body, query } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const { csrfToken } = getState();
    let response;
    try {
        response = await fetch(buildUrl(path, query), {
            method,
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch (error) {
        const message =
            error.name === 'AbortError'
                ? 'A solicitação demorou demais. Verifique sua conexão e tente novamente.'
                : 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        throw new ApiError(0, 'NETWORK', message);
    } finally {
        clearTimeout(timer);
    }
    return response;
}

async function toError(response, path) {
    let payload = null;
    try {
        payload = await response.json();
    } catch {
        /* resposta sem JSON */
    }
    const info = payload?.error ?? {};
    if (response.status === 401 && !PUBLIC_PATHS.includes(path)) unauthorizedHandler();
    return new ApiError(
        response.status,
        info.code ?? 'ERROR',
        info.message ?? 'Não foi possível concluir a operação.',
        info.details
    );
}

async function request(method, path, options) {
    const response = await send(method, path, options);
    if (!response.ok) throw await toError(response, path);
    return response.json();
}

export const api = {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body = {}) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    delete: (path) => request('DELETE', path),

    /** Baixa um arquivo (ex.: CSV) mantendo sessão e filtros. */
    async download(path, query, fallbackName) {
        const response = await send('GET', path, { query });
        if (!response.ok) throw await toError(response, path);
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    },
};
