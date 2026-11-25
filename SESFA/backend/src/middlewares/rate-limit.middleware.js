import { config } from '../config/environment.js';
import { ApiError } from '../utils/errors.js';

const buckets = new Map();

function hit(key, max, windowMs) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 20000) {
        for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    if (bucket.count > max) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        const error = new ApiError(429, 'Muitas requisições. Aguarde um instante.', 'RATE_LIMITED', {
            retryAfterSeconds: retryAfter,
        });
        error.retryAfter = retryAfter;
        throw error;
    }
}

/** Limite de requisições por IP (geral e, mais restrito, para rotas de autenticação). */
export function enforceRateLimit(ip, pathname) {
    const { windowMs, maxRequests, maxAuthRequests } = config.rateLimit;
    hit(`api:${ip}`, maxRequests, windowMs);
    if (pathname === '/api/v1/auth/login' || pathname === '/api/v1/auth/bootstrap') {
        hit(`auth:${ip}`, maxAuthRequests, windowMs);
    }
}

export const resetRateLimits = () => buckets.clear();
