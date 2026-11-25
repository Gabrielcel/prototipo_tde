// Montagem segura de HTML: todo valor interpolado é escapado, a menos que seja SafeHtml.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export class SafeHtml {
    constructor(value) {
        this.value = value;
    }

    toString() {
        return this.value;
    }
}

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"'`]/g, (char) => ESCAPES[char]);

/** Marca um trecho como HTML confiável (use somente com conteúdo montado por `html`). */
export const raw = (value) => new SafeHtml(String(value));

function renderValue(value) {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    if (value === null || value === undefined || typeof value === 'boolean') return '';
    return escapeHtml(value);
}

/** Template tag: html`<p>${valorDoBanco}</p>` escapa automaticamente. */
export function html(strings, ...values) {
    let output = strings[0];
    values.forEach((value, index) => {
        output += renderValue(value) + strings[index + 1];
    });
    return new SafeHtml(output);
}

export function setHtml(element, content) {
    element.innerHTML = content instanceof SafeHtml ? content.value : escapeHtml(content);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Monta href interno com query string, ignorando valores vazios. */
export function hrefTo(path, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') query.set(key, value);
    }
    const text = query.toString();
    return `#${path}${text ? `?${text}` : ''}`;
}
