import { config } from '../config/environment.js';

/** Data (AAAA-MM-DD) de um instante no fuso oficial da aplicação. */
export function dateInTimezone(instant = new Date(), timeZone = config.timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(instant);
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

export const todayInTimezone = () => dateInTimezone(new Date());

const pad = (value) => String(value).padStart(2, '0');

export function formatDateTime(instant, timeZone = config.timezone) {
    const date = new Date(instant);
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type).value;
    return {
        date: `${get('day')}/${get('month')}/${get('year')}`,
        time: `${pad(get('hour'))}:${pad(get('minute'))}`,
    };
}
