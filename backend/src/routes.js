import {
  deleteSession,
  findSession,
  sessionCookieName,
  sessionDurationSeconds,
  verifyCsrfToken,
} from './auth.js';
import { checkDatabase as checkDatabaseConnection, query } from './db.js';
import {
  createFamily,
  getFamily,
  listFamilies,
  updateFamily,
} from './families.js';
import {
  createNeed,
  createReferral,
  listNeeds,
  listReferrals,
  updateNeed,
  updateReferral,
} from './needs.js';
import { getSummaryReport } from './reports.js';
import {
  createVisit,
  getVisit,
  listVisits,
  registerVisit,
  updateVisit,
} from './visits.js';
import {
  createInitialManager,
  createUser,
  listUsers,
  login,
  updateUserStatus,
} from './users.js';

const maxBodySize = 64 * 1024;

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(data));
}

function requestError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function readJson(request) {
  const contentType = request.headers['content-type']?.split(';')[0].trim();
  if (contentType !== 'application/json') {
    return Promise.reject(requestError(415, 'Envie o conteúdo como application/json.'));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodySize) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) return reject(requestError(413, 'A requisição excede o limite permitido.'));

      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return reject(requestError(400, 'O conteúdo JSON deve ser um objeto.'));
        }
        resolve(body);
      } catch {
        reject(requestError(400, 'O conteúdo JSON é inválido.'));
      }
    });

    request.on('error', reject);
  });
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${sessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDurationSeconds}${secure}`;
}

function clearedSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

async function requireSession(request, response, checkCsrf = false) {
  const session = await findSession(request);
  if (!session) {
    sendJson(response, 401, { error: 'Faça login para continuar.' });
    return null;
  }

  if (checkCsrf && !verifyCsrfToken(session.csrfToken, request.headers['x-csrf-token'])) {
    sendJson(response, 403, { error: 'Token de segurança ausente ou inválido.' });
    return null;
  }

  return session;
}

function sendError(response, error) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error('Falha ao processar requisição da API:', error.code || error.name);
  }
  sendJson(response, statusCode, {
    error: statusCode >= 500 ? 'Erro interno. Tente novamente.' : error.message,
  });
}

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    const { pathname } = url;
    const filters = Object.fromEntries(url.searchParams);

    if (request.method === 'GET' && pathname === '/api/health') {
      return sendJson(response, 200, { status: 'ok', service: 'sesfa-api' });
    }

    if (request.method === 'GET' && pathname === '/api/health/db') {
      try {
        await checkDatabaseConnection();
        return sendJson(response, 200, { status: 'ok', database: 'connected' });
      } catch {
        return sendJson(response, 503, { status: 'error', database: 'unavailable' });
      }
    }

    if (request.method === 'GET' && pathname === '/api/v1/auth/status') {
      const result = await query('SELECT EXISTS (SELECT 1 FROM users) AS initialized');
      return sendJson(response, 200, { initialized: result.rows[0].initialized });
    }

    if (request.method === 'POST' && pathname === '/api/v1/auth/bootstrap') {
      const body = await readJson(request);
      const result = await createInitialManager(body);
      return sendJson(
        response,
        201,
        { user: result.user, csrfToken: result.csrfToken },
        { 'Set-Cookie': sessionCookie(result.token) }
      );
    }

    if (request.method === 'POST' && pathname === '/api/v1/auth/login') {
      const body = await readJson(request);
      const result = await login(body);
      if (!result) return sendJson(response, 401, { error: 'E-mail ou senha inválidos.' });

      return sendJson(
        response,
        200,
        { user: result.user, csrfToken: result.csrfToken },
        { 'Set-Cookie': sessionCookie(result.token) }
      );
    }

    if (request.method === 'GET' && pathname === '/api/v1/auth/me') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { user: session.user, csrfToken: session.csrfToken });
    }

    if (request.method === 'POST' && pathname === '/api/v1/auth/logout') {
      const session = await requireSession(request, response, true);
      if (!session) return;
      await deleteSession(request);
      return sendJson(
        response,
        200,
        { message: 'Sessão encerrada.' },
        { 'Set-Cookie': clearedSessionCookie() }
      );
    }

    if (request.method === 'GET' && pathname === '/api/v1/users') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { users: await listUsers() });
    }

    if (request.method === 'POST' && pathname === '/api/v1/users') {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const user = await createUser(session.user, await readJson(request));
      return sendJson(response, 201, { user });
    }

    const statusRoute = pathname.match(/^\/api\/v1\/users\/([^/]+)\/status$/);
    if (request.method === 'PATCH' && statusRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const body = await readJson(request);
      const user = await updateUserStatus(session.user, statusRoute[1], body.status);
      return sendJson(response, 200, { user });
    }

    if (request.method === 'GET' && pathname === '/api/v1/families') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { families: await listFamilies(session.user, filters) });
    }

    if (request.method === 'POST' && pathname === '/api/v1/families') {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const family = await createFamily(session.user, await readJson(request));
      return sendJson(response, 201, { family });
    }

    const familyRoute = pathname.match(/^\/api\/v1\/families\/([^/]+)$/);
    if (request.method === 'GET' && familyRoute) {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { family: await getFamily(session.user, familyRoute[1]) });
    }
    if (request.method === 'PATCH' && familyRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const family = await updateFamily(session.user, familyRoute[1], await readJson(request));
      return sendJson(response, 200, { family });
    }

    if (request.method === 'GET' && pathname === '/api/v1/visits') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { visits: await listVisits(session.user, filters) });
    }
    if (request.method === 'POST' && pathname === '/api/v1/visits') {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const visit = await createVisit(session.user, await readJson(request));
      return sendJson(response, 201, { visit });
    }

    const visitRecordRoute = pathname.match(/^\/api\/v1\/visits\/([^/]+)\/record$/);
    if (request.method === 'POST' && visitRecordRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const result = await registerVisit(session.user, visitRecordRoute[1], await readJson(request));
      return sendJson(response, 201, result);
    }
    const visitRoute = pathname.match(/^\/api\/v1\/visits\/([^/]+)$/);
    if (request.method === 'GET' && visitRoute) {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { visit: await getVisit(session.user, visitRoute[1]) });
    }
    if (request.method === 'PATCH' && visitRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const visit = await updateVisit(session.user, visitRoute[1], await readJson(request));
      return sendJson(response, 200, { visit });
    }

    if (request.method === 'GET' && pathname === '/api/v1/needs') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { needs: await listNeeds(session.user, filters) });
    }
    if (request.method === 'POST' && pathname === '/api/v1/needs') {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const need = await createNeed(session.user, await readJson(request));
      return sendJson(response, 201, { need });
    }

    const needReferralRoute = pathname.match(/^\/api\/v1\/needs\/([^/]+)\/referrals$/);
    if (request.method === 'POST' && needReferralRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const referral = await createReferral(session.user, needReferralRoute[1], await readJson(request));
      return sendJson(response, 201, { referral });
    }
    const needRoute = pathname.match(/^\/api\/v1\/needs\/([^/]+)$/);
    if (request.method === 'PATCH' && needRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const need = await updateNeed(session.user, needRoute[1], await readJson(request));
      return sendJson(response, 200, { need });
    }

    if (request.method === 'GET' && pathname === '/api/v1/referrals') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, { referrals: await listReferrals(session.user) });
    }
    const referralRoute = pathname.match(/^\/api\/v1\/referrals\/([^/]+)$/);
    if (request.method === 'PATCH' && referralRoute) {
      const session = await requireSession(request, response, true);
      if (!session) return;
      const referral = await updateReferral(session.user, referralRoute[1], await readJson(request));
      return sendJson(response, 200, { referral });
    }

    if (request.method === 'GET' && pathname === '/api/v1/reports/summary') {
      const session = await requireSession(request, response);
      if (!session) return;
      return sendJson(response, 200, await getSummaryReport(session.user, filters));
    }

    return sendJson(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    return sendError(response, error);
  }
}
