import { getState } from '../core/state.js';

const ALL = [
    { path: '/inicio', label: 'Início', icon: 'house', roles: ['gestor', 'voluntario'] },
    { path: '/familias', label: 'Famílias', icon: 'users', roles: ['gestor', 'voluntario'] },
    { path: '/agenda', label: 'Agenda', icon: 'calendar-days', roles: ['gestor', 'voluntario'] },
    { path: '/necessidades', label: 'Necessidades', icon: 'clipboard-list', roles: ['gestor', 'voluntario'] },
    { path: '/relatorios', label: 'Relatórios', icon: 'chart-no-axes-column', roles: ['gestor'] },
    { path: '/usuarios', label: 'Usuários', icon: 'user-plus', roles: ['gestor'] },
    { path: '/perfil', label: 'Meu perfil', icon: 'user', roles: ['gestor', 'voluntario'] },
];

export function navigationItems() {
    const role = getState().user?.role;
    return ALL.filter((item) => item.roles.includes(role));
}

/** Navegação inferior (celular): 4 itens principais + "Mais" (gestor) ou Perfil (voluntário). */
export function bottomItems() {
    const items = navigationItems();
    if (items.length <= 5) return { main: items, rest: [] };
    const main = items.slice(0, 4);
    const rest = items.slice(4);
    return { main, rest };
}
