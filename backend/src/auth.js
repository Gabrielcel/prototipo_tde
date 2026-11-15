import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { query } from './db.js';

const scrypt = promisify(scryptCallback);
const passwordOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const sessionCookieName = 'sesfa_session';
export const sessionDurationSeconds = 8 * 60 * 60;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, passwordOptions);

  return `scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, cost, blockSize, parallelism, saltHex, keyHex] = storedHash.split('$');

  if (
    algorithm !== 'scrypt' ||
    cost !== '131072' ||
    blockSize !== '8' ||
    parallelism !== '1' ||
    !/^[a-f0-9]{32}$/i.test(saltHex || '') ||
    !/^[a-f0-9]{128}$/i.test(keyHex || '')
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, passwordOptions);

  return timingSafeEqual(expected, actual);
}

const hashToken = token => createHash('sha256').update(token).digest('hex');

export function getSessionToken(request) {
  const cookieHeader = request.headers.cookie || '';
  const cookie = cookieHeader.split(';').map(value => value.trim()).find(value =>
    value.startsWith(`${sessionCookieName}=`)
  );
  const token = cookie?.slice(sessionCookieName.length + 1);

  return /^[a-f0-9]{64}$/i.test(token || '') ? token : null;
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');

  await query('DELETE FROM user_sessions WHERE expires_at <= NOW()');
  await query(
    `INSERT INTO user_sessions (user_id, token_hash, csrf_token, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '8 hours')`,
    [userId, hashToken(token), csrfToken]
  );

  return { token, csrfToken };
}

export async function findSession(request) {
  const token = getSessionToken(request);
  if (!token) return null;

  const result = await query(
    `SELECT s.id AS session_id, s.csrf_token, u.id, u.full_name, u.email, u.role, u.status
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND u.status = 'ativo'`,
    [hashToken(token)]
  );
  const row = result.rows[0];

  if (!row) return null;

  return {
    id: row.session_id,
    csrfToken: row.csrf_token,
    user: {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
    },
  };
}

export function verifyCsrfToken(expectedToken, submittedToken) {
  if (!/^[a-f0-9]{64}$/i.test(expectedToken || '') || !/^[a-f0-9]{64}$/i.test(submittedToken || '')) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedToken, 'hex'), Buffer.from(submittedToken, 'hex'));
}

export async function deleteSession(request) {
  const token = getSessionToken(request);
  if (!token) return;

  await query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
}
