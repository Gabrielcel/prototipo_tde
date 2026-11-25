import { html, setHtml } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { brandLink, topbar } from './header.js';
import { bottomItems, navigationItems } from './navigation.js';
import { getState } from '../core/state.js';
import { label } from '../utils/formatters.js';

export function renderShell(root) {
    const { user } = getState();
    const { main, rest } = bottomItems();
    setHtml(
        root,
        html`<div class="app-shell">
            <aside class="sidebar" aria-label="Menu principal">
                ${brandLink()}
                <nav class="side-nav" aria-label="Navegação principal">
                    ${navigationItems().map(
                        (item) =>
                            html`<a href="#${item.path}" data-nav="${item.path}">${icon(item.icon)}${item.label}</a>`
                    )}
                </nav>
                <div class="side-user">
                    <div>
                        <div class="side-user-name">${user.fullName}</div>
                        <div class="side-user-role">${label('role', user.role)}</div>
                    </div>
                    <button type="button" class="btn btn-sm" data-action="logout">${icon('log-out')}Sair</button>
                </div>
            </aside>
            <div class="main">
                ${topbar()}
                <main class="content" id="conteudo" tabindex="-1">
                    <div class="container" id="view"></div>
                </main>
                <nav class="bottom-nav" aria-label="Navegação principal (celular)">
                    <ul>
                        ${main.map(
                            (item) =>
                                html`<li>
                                    <a href="#${item.path}" data-nav="${item.path}"
                                        >${icon(item.icon)}<span>${item.label}</span></a
                                    >
                                </li>`
                        )}
                        ${
                            rest.length
                                ? html`<li>
                                      <button type="button" data-action="open-more">
                                          ${icon('ellipsis')}<span>Mais</span>
                                      </button>
                                  </li>`
                                : ''
                        }
                    </ul>
                </nav>
            </div>
        </div>`
    );
}

export function markActiveNavigation(path) {
    document.querySelectorAll('[data-nav]').forEach((link) => {
        const active = path === link.dataset.nav || path.startsWith(`${link.dataset.nav}/`);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}

export function moreSheetLinks() {
    const { rest } = bottomItems();
    return html`<nav class="modal-body sheet-links" aria-label="Mais opções">
        ${rest.map((item) => html`<a href="#${item.path}" data-action="modal-close">${icon(item.icon)}${item.label}</a>`)}
    </nav>`;
}
