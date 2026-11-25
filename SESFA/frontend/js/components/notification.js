import { icon } from './icons.js';
import { html, setHtml } from '../utils/dom.js';

const ICON_BY_TYPE = { success: 'circle-check', info: 'info', warning: 'triangle-alert', danger: 'circle-alert' };
const AUTO_CLOSE_MS = { success: 6000, info: 6000, warning: 10000 };
const MAX_VISIBLE = 4;

/** Erros permanecem na tela até serem dispensados; demais mensagens fecham sozinhas. */
export function toast(message, type = 'info', title = '') {
    const region = document.getElementById('toasts');
    if (!region) return;
    const element = document.createElement('div');
    element.className = `alert alert-${type} toast`;
    element.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    setHtml(
        element,
        html`${icon(ICON_BY_TYPE[type])}
            <div class="alert-body">${title ? html`<strong>${title}</strong>` : ''}${message}</div>
            <button type="button" class="toast-close" data-action="toast-close" aria-label="Fechar notificação">
                ${icon('x')}
            </button>`
    );
    region.append(element);
    while (region.children.length > MAX_VISIBLE) region.firstElementChild.remove();
    if (AUTO_CLOSE_MS[type]) setTimeout(() => element.remove(), AUTO_CLOSE_MS[type]);
}

export const toastSuccess = (message) => toast(message, 'success');
export const toastError = (message) => toast(message, 'danger', 'Não foi possível concluir');
