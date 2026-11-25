// Estado central da aplicação. Nada aqui vem de dados fictícios: tudo é carregado da API.
const state = {
    user: null,
    csrfToken: null,
    meta: null,
    initialized: null,
    directory: null,
};

export const getState = () => state;

export function setSession({ user, csrfToken }) {
    state.user = user;
    state.csrfToken = csrfToken;
    state.directory = null;
}

/** Limpa tudo que pertence ao usuário (logout, expiração ou troca de conta). */
export function clearSession() {
    state.user = null;
    state.csrfToken = null;
    state.directory = null;
}

export const setMeta = (meta) => {
    state.meta = meta;
};
export const setInitialized = (value) => {
    state.initialized = value;
};
export const setDirectory = (directory) => {
    state.directory = directory;
};
export const isManager = () => state.user?.role === 'gestor';
