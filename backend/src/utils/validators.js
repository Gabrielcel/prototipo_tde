// Validações reutilizáveis. Todas lançam ApiError 400 com mensagem compreensível.
import { badRequest } from './errors.js';
import { todayInTimezone } from './dates.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

export function requireUuid(value, label) {
    if (!isUuid(value)) throw badRequest(`Identificador de ${label} inválido.`);
    return value;
}

export function optionalUuid(value, label) {
    if (value === undefined || value === null || value === '') return null;
    return requireUuid(value, label);
}

/** Texto: remove espaços nas pontas e colapsa espaços repetidos. */
export function parseText(value, { label, max, min = 0, required = false, multiline = false }) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') throw badRequest(`${label}: informe um texto.`);
    let text = value.trim();
    text = multiline ? text.replace(/[ \t]+/g, ' ') : text.replace(/\s+/g, ' ');
    if (required && !text) throw badRequest(`Informe ${label}.`);
    if (text && text.length < min) throw badRequest(`${label}: use ao menos ${min} caracteres.`);
    if (text.length > max) throw badRequest(`${label}: use no máximo ${max} caracteres.`);
    return text || null;
}

export function parsePersonName(value, label, required = true) {
    const name = parseText(value, { label, max: 120, min: 2, required });
    if (name && !NAME_PATTERN.test(name)) {
        throw badRequest(`${label}: use apenas letras, espaços, hífen, apóstrofo e ponto.`);
    }
    return name;
}

export function parseEmail(value, { required = false } = {}) {
    const email = parseText(value, { label: 'E-mail', max: 254, required });
    if (!email) return null;
    if (!EMAIL_PATTERN.test(email)) throw badRequest('Informe um e-mail válido.');
    return email.toLowerCase();
}

/** Telefone brasileiro com DDD (10 ou 11 dígitos), salvo como (DD) 9XXXX-XXXX. */
export function parsePhone(value, { required = false } = {}) {
    const raw = parseText(value, { label: 'Telefone', max: 30, required });
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
        digits = digits.slice(2);
    }
    if (digits.length !== 10 && digits.length !== 11) {
        throw badRequest('Informe o telefone com DDD (10 ou 11 dígitos).');
    }
    if (digits.length === 11 && digits[2] !== '9') {
        throw badRequest('Celulares com 11 dígitos devem começar com 9 após o DDD.');
    }
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    const split = rest.length === 9 ? 5 : 4;
    return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

export const phoneDigits = (value) => String(value ?? '').replace(/\D/g, '');

export function parsePostalCode(value) {
    const raw = parseText(value, { label: 'CEP', max: 12 });
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) throw badRequest('Informe um CEP com 8 dígitos.');
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Data AAAA-MM-DD existente no calendário. */
export function parseDateOnly(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw badRequest(`${label}: use o formato AAAA-MM-DD.`);
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw badRequest(`${label}: data inexistente.`);
    }
    return value;
}

export function parseBirthDate(value, { required = false, label = 'Data de nascimento' } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) throw badRequest(`Informe ${label.toLowerCase()}.`);
        return null;
    }
    const date = parseDateOnly(value, label);
    if (date > todayInTimezone()) throw badRequest(`${label} não pode ser futura.`);
    if (date < '1900-01-01') throw badRequest(`${label} inválida.`);
    return date;
}

/** Instante ISO 8601 com fuso horário explícito; devolve ISO em UTC. */
export function parseInstant(value, { label = 'Data e horário', future = false } = {}) {
    if (typeof value !== 'string' || !INSTANT_PATTERN.test(value)) {
        throw badRequest(`${label}: informe data e horário com fuso horário (ISO 8601).`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw badRequest(`${label} inválidos.`);
    if (future && date.getTime() <= Date.now()) {
        throw badRequest('A visita precisa ser marcada para um horário futuro.');
    }
    return date.toISOString();
}

export function parseEnum(value, allowed, label, { required = true } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) throw badRequest(`Informe ${label}.`);
        return null;
    }
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (!allowed.includes(normalized)) throw badRequest(`${label} inválido(a).`);
    return normalized;
}

export function parsePassword(value, label = 'A senha') {
    if (typeof value !== 'string' || value.length < 8 || value.length > 1024) {
        throw badRequest(`${label} deve ter entre 8 e 1024 caracteres.`);
    }
    if (!value.trim()) throw badRequest(`${label} não pode conter apenas espaços.`);
    return value;
}

export function parseBoolean(value, label) {
    if (value === undefined || value === null || value === '') return null;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw badRequest(`${label} deve ser verdadeiro ou falso.`);
}

export function requireObject(value, label = 'O conteúdo') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest(`${label} deve ser um objeto.`);
    }
    return value;
}

export function requireArray(value, label, { max }) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw badRequest(`${label} deve ser uma lista.`);
    if (value.length > max) throw badRequest(`${label}: máximo de ${max} itens.`);
    return value;
}
