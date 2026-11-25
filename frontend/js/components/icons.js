import { ICONS } from './icons-data.js';
import { raw } from '../utils/dom.js';

/** Ícone Lucide inline; decorativo por padrão (aria-hidden). */
export function icon(name, className = '') {
    const shapes = ICONS[name];
    if (!shapes) return raw('');
    return raw(
        `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`
    );
}
