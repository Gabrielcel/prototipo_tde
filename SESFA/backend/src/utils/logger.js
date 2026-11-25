import { config } from '../config/environment.js';

const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function write(level, message, meta) {
    if (levels[level] < (levels[config.logLevel] ?? levels.info)) return;
    const line = { time: new Date().toISOString(), level, message, ...meta };
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    out(JSON.stringify(line));
}

// Nunca registre senhas, tokens ou corpos de requisição.
export const logger = {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
};
