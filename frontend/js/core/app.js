// Inicialização da aplicação e tratamento central de eventos.
import { api, onUnauthorized } from '../services/api.js';
import { logout, restoreSession } from '../services/auth.js';
import { clearSession, getState, setInitialized, setMeta } from './state.js';
import { startRouter, stopRouter, refreshRoute } from './router.js';
import {
    getChangeHandler,
    getClickHandler,
    getFormHandler,
    getInputHandler,
    registerActions,
    registerInputs,
} from './actions.js';
import { html, setHtml } from '../utils/dom.js';
import { setTimezone, maskPhone, maskPostalCode } from '../utils/formatters.js';
import { renderShell, moreSheetLinks } from '../layout/sidebar.js';
import { closeModal, openModal } from '../components/modal.js';
import { toast } from '../components/notification.js';
import { icon } from '../components/icons.js';
import { renderLogin } from '../modules/auth/login.js';

const root = document.getElementById('app');
let sessionEnding = false;

function showLogin(notice = '') {
    stopRouter();
    clearSession();
    document.querySelectorAll('dialog.modal').forEach((dialog) => dialog.close());
    document.getElementById('toasts')?.replaceChildren();
    window.history.replaceState(null, '', window.location.pathname);
    document.title = 'Entrar — SESFA';
    setHtml(root, renderLogin({ setup: getState().initialized === false, notice }));
    sessionEnding = false;
}

function enterApp() {
    renderShell(root);
    return startRouter();
}

function showFatal(error) {
    setHtml(
        root,
        html`<main class="content">
            <div class="container">
                <div class="card">
                    <div class="empty-state" role="alert">
                        ${icon('circle-alert')}
                        <h3>Não foi possível iniciar o SESFA</h3>
                        <p>${error.message}</p>
                        <button type="button" class="btn btn-primary" data-action="reload">
                            ${icon('refresh-cw')}Tentar novamente
                        </button>
                    </div>
                </div>
            </div>
        </main>`
    );
}

async function boot() {
    try {
        const [meta, status] = await Promise.all([api.get('/meta'), api.get('/auth/status')]);
        setMeta(meta.data);
        setTimezone(meta.data.timezone);
        setInitialized(status.data.initialized);
        const restored = status.data.initialized ? await restoreSession() : false;
        if (restored) await enterApp();
        else showLogin();
    } catch (error) {
        showFatal(error);
    }
}

// Sessão expirada (HTTP 401 em qualquer requisição protegida) → volta ao login uma única vez.
onUnauthorized(() => {
    if (sessionEnding || !getState().user) return;
    sessionEnding = true;
    showLogin('Sua sessão expirou. Entre novamente para continuar.');
});
document.addEventListener('sesfa:authenticated', () => enterApp());

registerActions({
    'skip-to-content'(_, event) {
        event.preventDefault();
        document.getElementById('conteudo')?.focus();
    },
    'modal-close': (element) => closeModal(element),
    'toast-close': (element) => element.closest('.toast')?.remove(),
    'retry-route': () => refreshRoute(),
    reload: () => window.location.reload(),
    async logout() {
        sessionEnding = true;
        try {
            await logout();
        } catch {
            clearSession();
        }
        showLogin('Você saiu do sistema.');
    },
    'open-more': () => openModal({ title: 'Mais opções', body: moreSheetLinks() }),
});

registerInputs({
    'mask-phone': (input) => {
        input.value = maskPhone(input.value);
    },
    'mask-cep': (input) => {
        input.value = maskPostalCode(input.value);
    },
});

// ---- Único ponto de entrada de eventos da interface --------------------------------------
function reportFailure(error) {
    console.error(error);
    toast(error?.message ?? 'Ocorreu um erro inesperado. Tente novamente.', 'danger', 'Não foi possível concluir');
}

document.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    if (!element || element.disabled || element.getAttribute('aria-busy') === 'true') return;
    const handler = getClickHandler(element.dataset.action);
    if (!handler) return;
    Promise.resolve(handler(element, event)).catch(reportFailure);
});

document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const handler = getFormHandler(form.dataset.form);
    if (handler) Promise.resolve(handler(form, event)).catch(reportFailure);
});

document.addEventListener('input', (event) => {
    const element = event.target.closest('[data-input]');
    if (!element) return;
    getInputHandler(element.dataset.input)?.(element, event);
});

document.addEventListener('change', (event) => {
    const element = event.target.closest('[data-change]');
    if (!element) return;
    const handler = getChangeHandler(element.dataset.change);
    if (handler) Promise.resolve(handler(element, event)).catch(reportFailure);
});

boot();
