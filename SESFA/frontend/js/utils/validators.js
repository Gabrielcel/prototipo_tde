// Validações de conveniência para feedback imediato. O servidor é a validação definitiva.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value) => EMAIL.test(String(value).trim());

export function isPhone(value) {
    let digits = String(value).replace(/\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
    return (digits.length === 10 || digits.length === 11) && (digits.length === 10 || digits[2] === '9');
}

export const isPostalCode = (value) => String(value).replace(/\D/g, '').length === 8;

export function isRealDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
export const isPersonName = (value) => String(value).trim().length >= 2 && NAME.test(String(value).trim());
