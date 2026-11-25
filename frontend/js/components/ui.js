import { html } from '../utils/dom.js';
import { icon } from './icons.js';
import { hrefTo } from '../utils/dom.js';
import { label } from '../utils/formatters.js';

const TONES = {
    visitStatus: {
        agendada: 'neutral',
        sem_responsavel: 'warning',
        reagendada: 'warning',
        concluida: 'positive',
        cancelada: 'muted',
    },
    priority: { alta: 'danger', media: 'warning', baixa: 'neutral' },
    needStatus: { pendente: 'warning', em_andamento: 'neutral', resolvida: 'positive' },
    referralStatus: { aberto: 'warning', em_andamento: 'neutral', concluido: 'positive', cancelado: 'muted' },
    familyStatus: { cadastro_recente: 'neutral', aguardando_visita: 'warning', em_acompanhamento: 'positive' },
    userStatus: { ativo: 'positive', inativo: 'muted' },
    role: { gestor: 'neutral', voluntario: 'neutral' },
};
// Ícone junto ao texto: a cor nunca é o único indicador de situação.
const ICONS = { positive: 'circle-check', warning: 'clock', danger: 'circle-alert', muted: 'ban', neutral: '' };

export function badge(group, value) {
    const tone = TONES[group]?.[value] ?? 'neutral';
    return html`<span class="badge badge-${tone}">${ICONS[tone] ? icon(ICONS[tone]) : ''}${label(group, value)}</span>`;
}

export function pageHeader({ title, subtitle = '', actions = '', back = null }) {
    return html`<header class="page-header">
        <div>
            ${back ? html`<a class="back-link" href="${back.href}">${icon('chevron-left')}${back.label}</a>` : ''}
            <h1 id="page-title" tabindex="-1">${title}</h1>
            ${subtitle ? html`<p>${subtitle}</p>` : ''}
        </div>
        ${actions ? html`<div class="actions">${actions}</div>` : ''}
    </header>`;
}

export function emptyState({ iconName = 'clipboard-list', title, text = '', action = '' }) {
    return html`<div class="empty-state">
        ${icon(iconName)}
        <h3>${title}</h3>
        ${text ? html`<p>${text}</p>` : ''}${action}
    </div>`;
}

export function loadingBlock() {
    return html`<div role="status" aria-live="polite">
        <span class="sr-only">Carregando…</span>
        <div class="grid-stats">
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
        </div>
        <div class="card" aria-hidden="true">
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
        </div>
    </div>`;
}

export function errorState(error) {
    return html`<div class="card">
        <div class="empty-state" role="alert">
            ${icon('circle-alert')}
            <h3>Não foi possível carregar</h3>
            <p>${error?.message ?? 'Ocorreu um erro inesperado.'}</p>
            <button type="button" class="btn btn-primary" data-action="retry-route">
                ${icon('refresh-cw')}Tentar novamente
            </button>
        </div>
    </div>`;
}

export function permissionState() {
    return html`<div class="card">
        <div class="empty-state">
            ${icon('lock')}
            <h3>Acesso não autorizado</h3>
            <p>O seu perfil não tem permissão para acessar esta página.</p>
            <a class="btn btn-primary" href="#/inicio">Voltar ao início</a>
        </div>
    </div>`;
}

export function statCard({ label: text, value, hint = '', tone = '', href = '' }) {
    const body = html`<span class="stat-label">${text}</span
        ><span class="stat-value">${value}</span>${hint ? html`<span class="stat-hint">${hint}</span>` : ''}`;
    const cls = `stat${tone ? ` stat-${tone}` : ''}`;
    return href ? html`<a class="${cls}" href="${href}">${body}</a>` : html`<div class="${cls}">${body}</div>`;
}

/** Paginação com links (mantém filtros na URL). */
export function pagination(info, path, params) {
    if (!info) return '';
    const { page, totalPages, total, limit } = info;
    const from = total ? (page - 1) * limit + 1 : 0;
    const to = Math.min(page * limit, total);
    const link = (target, text, iconName, disabled) =>
        disabled
            ? html`<span class="btn btn-sm" aria-disabled="true">${icon(iconName)}${text}</span>`
            : html`<a class="btn btn-sm" href="${hrefTo(path, { ...params, page: target })}"
                  >${text === 'Anterior' ? icon(iconName) : ''}${text}${text === 'Próxima' ? icon(iconName) : ''}</a
              >`;
    return html`<nav class="pagination" aria-label="Paginação">
        <span>${total ? html`Exibindo ${from}–${to} de ${total}` : 'Nenhum registro'}</span>
        <span class="actions">
            ${link(page - 1, 'Anterior', 'chevron-left', page <= 1)}
            <span aria-current="page">Página ${page} de ${totalPages}</span>
            ${link(page + 1, 'Próxima', 'chevron-right', page >= totalPages)}
        </span>
    </nav>`;
}

export const requiredNote = () =>
    html`<p class="hint">Campos marcados com <span class="required-mark">*</span> são obrigatórios.</p>`;
