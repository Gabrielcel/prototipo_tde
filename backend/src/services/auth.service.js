// Senhas (scrypt), sessões, token CSRF e limitação de tentativas de login.
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { query } from '../config/database.js';
import { config } from '../config/environment.js';
import { ApiError } from '../utils/errors.js';

const scrypt = promisify(scryptCallback);

// ---------------------------------------------------------------------------
// Senhas. Formato compatível com a versão original: scrypt$N$r$p$salt$chave
// ---------------------------------------------------------------------------
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
let running = 0;
const waiting = [];

async function limited(task) {
    if (running >= config.security.maxConcurrentHashes) {
        await new Promise((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
        return await task();
    } finally {
        running -= 1;
        waiting.shift()?.();
    }
}

const maxmemFor = (n) => 256 * n * R;

export function hashPassword(password) {
    const n = config.security.scryptN;
    return limited(async () => {
        const salt = randomBytes(16);
        const key = await scrypt(password, salt, KEY_LENGTH, { N: n, r: R, p: P, maxmem: maxmemFor(n) });
        return `scrypt$${n}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`;
    });
}

export async function verifyPassword(password, storedHash) {
    const [algorithm, cost, blockSize, parallelism, saltHex, keyHex] = String(storedHash).split('$');
    const n = Number(cost);
    if (
        algorithm !== 'scrypt' ||
        !Number.isInteger(n) ||
        n < 1024 ||
        n > 1048576 ||
        (n & (n - 1)) !== 0 ||
        Number(blockSize) !== R ||
        Number(parallelism) !== P ||
        !/^[a-f0-9]{32}$/i.test(saltHex || '') ||
        !/^[a-f0-9]{128}$/i.test(keyHex || '')
    ) {
        return false;
    }
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await limited(() =>
        scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
            N: n,
            r: R,
            p: P,
            maxmem: maxmemFor(n),
        })
    );
    return timingSafeEqual(expected, actual);
}

let dummyHashPromise;
/** Verificação "falsa" para manter o tempo de resposta quando o e-mail não existe. */
export async function burnPasswordCheck(password) {
    dummyHashPromise ??= hashPassword('senha-descartavel-sesfa');
    await verifyPassword(password, await dummyHashPromise);
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------
const { cookieName, idleSeconds, absoluteSeconds, renewAfterSeconds, secureCookie } = config.session;
export const sessionCookieName = cookieName;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function readSessionToken(request) {
    const cookies = (request.headers.cookie || '').split(';').map((part) => part.trim());
    const found = cookies.find((part) => part.startsWith(`${cookieName}=`));
    const token = found?.slice(cookieName.length + 1);
    return TOKEN_PATTERN.test(token || '') ? token : null;
}

export function sessionCookie(token, maxAge = idleSeconds) {
    return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`;
}

export const clearedSessionCookie = () =>
    `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}`;

export async function createSession(userId, executor = { query }) {
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    await executor.query(
        `INSERT INTO user_sessions (user_id, token_hash, csrf_token, expires_at, last_seen_at)
         VALUES ($1, $2, $3, NOW() + make_interval(secs => $4), NOW())`,
        [userId, hashToken(token), csrfToken, idleSeconds]
    );
    return { token, csrfToken };
}

/** Localiza a sessão válida e a renova (janela deslizante limitada pelo prazo absoluto). */
export async function findSession(request) {
    const token = readSessionToken(request);
    if (!token) return null;
    const tokenHash = hashToken(token);
    const result = await query(
        `SELECT s.id AS session_id, s.csrf_token, s.last_seen_at,
                u.id, u.full_name, u.email, u.role
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND s.created_at + make_interval(secs => $2) > NOW()
           AND u.status = 'ativo'`,
        [tokenHash, absoluteSeconds]
    );
    const row = result.rows[0];
    if (!row) return null;

    let renewedCookie = null;
    if (Date.now() - new Date(row.last_seen_at).getTime() > renewAfterSeconds * 1000) {
        const renewed = await query(
            `UPDATE user_sessions
             SET last_seen_at = NOW(),
                 expires_at = LEAST(NOW() + make_interval(secs => $2),
                                    created_at + make_interval(secs => $3))
             WHERE id = $1
             RETURNING GREATEST(1, EXTRACT(EPOCH FROM (expires_at - NOW()))::int) AS max_age`,
            [row.session_id, idleSeconds, absoluteSeconds]
        );
        renewedCookie = sessionCookie(token, renewed.rows[0].max_age);
    }
    return {
        id: row.session_id,
        csrfToken: row.csrf_token,
        renewedCookie,
        user: { id: row.id, fullName: row.full_name, email: row.email, role: row.role },
    };
}

export function verifyCsrfToken(expected, submitted) {
    if (!TOKEN_PATTERN.test(expected || '') || !TOKEN_PATTERN.test(submitted || '')) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(submitted, 'hex'));
}

export async function deleteSessionByToken(token, executor = { query }) {
    if (token) await executor.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Encerra todas as sessões de um usuário (exceto, opcionalmente, uma). */
export async function deleteUserSessions(userId, exceptSessionId = null, executor = { query }) {
    await executor.query('DELETE FROM user_sessions WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2)', [
        userId,
        exceptSessionId,
    ]);
}

export async function cleanupExpired() {
    await query(
        `DELETE FROM user_sessions
         WHERE expires_at <= NOW() OR created_at + make_interval(secs => $1) <= NOW()`,
        [absoluteSeconds]
    );
    await query(`DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '1 day'`);
}

// ---------------------------------------------------------------------------
// Limitação de tentativas de login (por conta e por IP, sem bloqueio permanente)
// ---------------------------------------------------------------------------
export async function assertLoginAllowed(emailKey, ip) {
    const { maxFailuresPerAccount, maxFailuresPerIp, windowSeconds } = config.login;
    const result = await query(
        `SELECT
            COUNT(*) FILTER (WHERE email_key = $1)::int AS account_failures,
            COUNT(*) FILTER (WHERE ip = $2)::int AS ip_failures,
            MIN(created_at) FILTER (WHERE email_key = $1) AS account_oldest,
            MIN(created_at) FILTER (WHERE ip = $2) AS ip_oldest
         FROM login_attempts
         WHERE succeeded = FALSE
           AND created_at > NOW() - make_interval(secs => $3)
           AND (email_key = $1 OR ip = $2)`,
        [emailKey, ip, windowSeconds]
    );
    const row = result.rows[0];
    const blockedByAccount = row.account_failures >= maxFailuresPerAccount;
    const blockedByIp = row.ip_failures >= maxFailuresPerIp;
    if (!blockedByAccount && !blockedByIp) return;

    const oldest = new Date(blockedByAccount ? row.account_oldest : row.ip_oldest).getTime();
    const retryAfter = Math.max(1, Math.ceil(windowSeconds - (Date.now() - oldest) / 1000));
    const error = new ApiError(
        429,
        'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.',
        'TOO_MANY_ATTEMPTS',
        { retryAfterSeconds: retryAfter }
    );
    error.retryAfter = retryAfter;
    throw error;
}

export async function recordLoginAttempt(emailKey, ip, succeeded) {
    await query('INSERT INTO login_attempts (email_key, ip, succeeded) VALUES ($1, $2, $3)', [
        emailKey.slice(0, 254),
        ip,
        succeeded,
    ]);
    if (succeeded) {
        await query('DELETE FROM login_attempts WHERE email_key = $1 AND succeeded = FALSE', [emailKey.slice(0, 254)]);
    }
}
