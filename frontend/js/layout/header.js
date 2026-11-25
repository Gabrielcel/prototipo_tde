import { html } from '../utils/dom.js';
import { icon } from '../components/icons.js';

export function brandLink() {
    return html`<a class="brand" href="#/inicio">
        <img src="/assets/images/logo/logo-symbol-light.svg" alt="" width="40" height="40" />
        <span class="brand-name">SESFA<span class="brand-sub">Acompanhamento Familiar</span></span>
    </a>`;
}

/** Barra superior exibida em telas pequenas. */
export function topbar() {
    return html`<div class="topbar">
        ${brandLink()}
        <button type="button" class="btn btn-sm" data-action="logout" aria-label="Sair do sistema">
            ${icon('log-out')}Sair
        </button>
    </div>`;
}
