import { api, ApiError } from './api.js';
import { clearSession, setDirectory, setSession } from '../core/state.js';

let restoring = null;

/** Restaura a sessão existente. Chamadas simultâneas compartilham a mesma requisição. */
export function restoreSession() {
    restoring ??= (async () => {
        try {
            const { data } = await api.get('/auth/me');
            setSession(data);
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                clearSession();
                return false;
            }
            throw error;
        } finally {
            restoring = null;
        }
    })();
    return restoring;
}

export async function login(email, password) {
    clearSession(); // nada do usuário anterior permanece ao trocar de conta
    const { data } = await api.post('/auth/login', { email, password });
    setSession(data);
}

export async function bootstrap(account) {
    clearSession();
    const { data } = await api.post('/auth/bootstrap', account);
    setSession(data);
}

export async function logout() {
    try {
        await api.post('/auth/logout');
    } finally {
        clearSession();
    }
}

export async function loadDirectory(state) {
    if (state.directory) return state.directory;
    const { data } = await api.get('/users/directory');
    setDirectory(data);
    return data;
}
