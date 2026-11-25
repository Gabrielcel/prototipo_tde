import { icon } from './icons.js';
import { html, setHtml } from '../utils/dom.js';

const FOCUSABLE = 'input:not([type="hidden"]), select, textarea';

/** Janela modal acessível baseada em <dialog> (foco preso, Esc fecha, foco volta ao botão de origem). */
export function openModal({ title, body, footer = '', wide = false, onClose }) {
    const dialog = document.createElement('dialog');
    dialog.className = `modal${wide ? ' modal-wide' : ''}`;
    const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', titleId);
    setHtml(
        dialog,
        html`<div class="modal-header">
                <h2 id="${titleId}">${title}</h2>
                <button type="button" class="btn btn-text btn-icon" data-action="modal-close" aria-label="Fechar">
                    ${icon('x')}
                </button>
            </div>
            ${body}${footer}`
    );
    const opener = document.activeElement;
    dialog.addEventListener('close', () => {
        dialog.remove();
        onClose?.();
        if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector(FOCUSABLE)?.focus();
    return dialog;
}

export const closeModal = (from) =>
    (from?.closest?.('dialog') ?? document.querySelector('dialog.modal[open]'))?.close();

/** Confirmação para ações críticas; descreve o que vai acontecer. Resolve true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false, extra = '' }) {
    return new Promise((resolve) => {
        let answer = false;
        const dialog = openModal({
            title,
            body: html`<div class="modal-body">
                <p>${message}</p>
                ${extra}
            </div>`,
            footer: html`<div class="modal-footer">
                <button type="button" class="btn" data-action="modal-close">Voltar</button>
                <button
                    type="button"
                    class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}"
                    data-action="modal-confirm"
                >
                    ${confirmLabel}
                </button>
            </div>`,
            onClose: () => resolve(answer),
        });
        dialog.addEventListener('click', (event) => {
            if (event.target.closest('[data-action="modal-confirm"]')) {
                answer = true;
                dialog.close();
            }
        });
    });
}
