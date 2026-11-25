import { config } from '../config/environment.js';

const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

export function clientIp(request) {
    let ip = request.socket?.remoteAddress || 'unknown';
    if (config.security.trustProxy) {
        const forwarded = String(request.headers['x-forwarded-for'] || '')
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
        // O proxy confiável acrescenta o IP do cliente ao final da lista.
        if (forwarded.length) ip = forwarded[forwarded.length - 1];
    }
    return ip.replace(/^::ffff:/, '').slice(0, 64);
}

export function isSecureRequest(request) {
    if (request.socket?.encrypted) return true;
    return config.security.trustProxy && request.headers['x-forwarded-proto'] === 'https';
}

/** Cabeçalhos de segurança aplicados a todas as respostas (API e arquivos estáticos). */
export function applySecurityHeaders(request, response) {
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (config.isProduction && isSecureRequest(request)) {
        response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
}

/** Bloqueia requisições de escrita vindas de outra origem (complementa o SameSite e o CSRF). */
export function originAllowed(request) {
    const origin = request.headers.origin;
    if (!origin) return true;
    if (config.security.allowedOrigins.includes(origin)) return true;
    const proto = isSecureRequest(request) ? 'https' : 'http';
    const host =
        request.headers['x-forwarded-host'] && config.security.trustProxy
            ? request.headers['x-forwarded-host']
            : request.headers.host;
    return origin === `${proto}://${host}`;
}
