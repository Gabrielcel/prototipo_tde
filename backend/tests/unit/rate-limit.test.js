import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_MAX = '3';
process.env.RATE_LIMIT_AUTH_MAX = '2';
const { enforceRateLimit, resetRateLimits } = await import('../../src/middlewares/rate-limit.middleware.js');

test('limita requisições por IP e de forma mais restrita no login', () => {
    resetRateLimits();
    for (let i = 0; i < 3; i += 1) enforceRateLimit('1.1.1.1', '/api/v1/families');
    assert.throws(
        () => enforceRateLimit('1.1.1.1', '/api/v1/families'),
        (error) => error.statusCode === 429 && error.retryAfter > 0
    );
    enforceRateLimit('2.2.2.2', '/api/v1/auth/login');
    enforceRateLimit('2.2.2.2', '/api/v1/auth/login');
    assert.throws(
        () => enforceRateLimit('2.2.2.2', '/api/v1/auth/login'),
        (error) => error.statusCode === 429
    );
    enforceRateLimit('3.3.3.3', '/api/v1/auth/login'); // outro IP não é afetado
});
