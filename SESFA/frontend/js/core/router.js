// Roteador por hash (#/caminho?filtros). Controla permissões, carregamento, erros e foco.
import { getState } from './state.js';
import { errorState, emptyState, loadingBlock, permissionState } from '../components/ui.js';
import { setHtml, hrefTo } from '../utils/dom.js';
import { markActiveNavigation } from '../layout/sidebar.js';

const ROUTES = [
    {
        pattern: '/inicio',
        title: 'Início',
        load: () => import('../modules/dashboard/dashboard.js'),
        view: 'renderDashboard',
    },
    {
        pattern: '/familias',
        title: 'Famílias',
        load: () => import('../modules/families/families.js'),
        view: 'renderList',
    },
    {
        pattern: '/familias/nova',
        title: 'Nova família',
        roles: ['gestor'],
        load: () => import('../modules/families/families-form.js'),
        view: 'renderForm',
    },
    {
        pattern: '/familias/:id',
        title: 'Família',
        load: () => import('../modules/families/families.js'),
        view: 'renderDetail',
    },
    {
        pattern: '/familias/:id/editar',
        title: 'Editar família',
        roles: ['gestor'],
        load: () => import('../modules/families/families-form.js'),
        view: 'renderForm',
    },
    { pattern: '/agenda', title: 'Agenda', load: () => import('../modules/visits/visits.js'), view: 'renderAgenda' },
    { pattern: '/agenda/:id', title: 'Visita', load: () => import('../modules/visits/visits.js'), view: 'renderVisit' },
    {
        pattern: '/agenda/:id/registro',
        title: 'Registro de visita',
        load: () => import('../modules/visits/visits-form.js'),
        view: 'renderRecord',
    },
    {
        pattern: '/necessidades',
        title: 'Necessidades e encaminhamentos',
        load: () => import('../modules/needs/needs.js'),
        view: 'renderNeeds',
    },
    {
        pattern: '/relatorios',
        title: 'Relatórios',
        roles: ['gestor'],
        load: () => import('../modules/reports/reports.js'),
        view: 'renderReports',
    },
    {
        pattern: '/usuarios',
        title: 'Usuários',
        roles: ['gestor'],
        load: () => import('../modules/users/users.js'),
        view: 'renderUsers',
    },
    {
        pattern: '/perfil',
        title: 'Meu perfil',
        load: () => import('../modules/profile/profile.js'),
        view: 'renderProfile',
    },
].map((route) => {
    const names = [];
    const regex = new RegExp(`^${route.pattern.replace(/:([a-z]+)/g, (_, name) => (names.push(name), '([^/]+)'))}$`);
    return { ...route, regex, names };
});

let active = false;
let renderToken = 0;
let current = { path: '', query: {} };

export function parseHash(hash = window.location.hash) {
    const text = hash.startsWith('#/') ? hash.slice(1) : '';
    const [path, queryText = ''] = text.split('?');
    return { path: path || '', query: Object.fromEntries(new URLSearchParams(queryText)) };
}

function matchRoute(path) {
    for (const route of ROUTES) {
        const found = path.match(route.regex);
        if (!found) continue;
        const params = {};
        route.names.forEach((name, index) => {
            params[name] = decodeURIComponent(found[index + 1]);
        });
        return { route, params };
    }
    return null;
}

export const currentRoute = () => current;
export const setTitle = (text) => {
    document.title = `${text} — SESFA`;
};

export function navigate(path, params = {}, { replace = false, silent = false } = {}) {
    const target = hrefTo(path, params);
    if (replace) window.history.replaceState(null, '', target);
    else window.location.hash = target;
    if (replace) resolve({ silent });
}

// Em atualizações silenciosas (filtros), preserva o foco e o texto que a pessoa está digitando.
function captureFocus() {
    const element = document.activeElement;
    if (!element?.id || !('value' in element)) return null;
    return { id: element.id, value: element.value, start: element.selectionStart, end: element.selectionEnd };
}

function restoreFocus(saved) {
    const element = saved && document.getElementById(saved.id);
    if (!element) return;
    element.focus({ preventScroll: true });
    if (element.value !== saved.value) element.value = saved.value;
    try {
        element.setSelectionRange(saved.start, saved.end);
    } catch {
        /* campos sem seleção (select, date) */
    }
}

async function resolve({ silent = false } = {}) {
    if (!active || !getState().user) return;
    const hash = window.location.hash;
    if (hash && !hash.startsWith('#/')) return; // âncoras internas (ex.: "pular para o conteúdo")
    const { path, query } = parseHash();
    if (!path) return navigate('/inicio', {}, { replace: true });

    const view = document.getElementById('view');
    if (!view) return;
    current = { path, query };
    markActiveNavigation(path);

    const matched = matchRoute(path);
    if (!matched) {
        setHtml(
            view,
            emptyState({
                iconName: 'search',
                title: 'Página não encontrada',
                text: 'O endereço acessado não existe.',
                action: '',
            })
        );
        return;
    }
    const { route, params } = matched;
    setTitle(route.title);
    if (route.roles && !route.roles.includes(getState().user.role)) {
        setHtml(view, permissionState());
        return;
    }

    const token = ++renderToken;
    const saved = silent ? captureFocus() : null;
    if (!silent) setHtml(view, loadingBlock());
    try {
        const module = await route.load();
        const content = await module[route.view]({ params, query });
        if (token !== renderToken) return;
        setHtml(view, content);
        restoreFocus(saved);
    } catch (error) {
        if (token !== renderToken) return;
        setHtml(view, errorState(error));
    }
    if (token === renderToken && !silent) {
        window.scrollTo(0, 0);
        document.getElementById('page-title')?.focus({ preventScroll: true });
    }
}

export const refreshRoute = (options) => resolve(options);

export function startRouter() {
    if (!active) window.addEventListener('hashchange', () => resolve());
    active = true;
    return resolve();
}

export function stopRouter() {
    active = false;
    renderToken += 1;
    current = { path: '', query: {} };
}
