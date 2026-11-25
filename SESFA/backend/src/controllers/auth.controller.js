import { badRequest } from '../utils/errors.js';
import { sendData } from '../utils/responses.js';
import { parseEmail, parsePassword, parsePersonName } from '../utils/validators.js';
import { clearedSessionCookie, readSessionToken, sessionCookie } from '../services/auth.service.js';
import * as users from '../services/users.service.js';

export async function status({ res }) {
    sendData(res, 200, { initialized: await users.isInitialized() });
}

export async function bootstrap({ res, body, ip }) {
    const account = {
        fullName: parsePersonName(body.fullName, 'Nome'),
        email: parseEmail(body.email, { required: true }),
        password: parsePassword(body.password),
    };
    const result = await users.createInitialManager(account, ip);
    sendData(
        res,
        201,
        { user: result.user, csrfToken: result.csrfToken },
        { 'Set-Cookie': sessionCookie(result.token) }
    );
}

export async function login({ res, body, ip }) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw badRequest('Informe e-mail e senha.');
    if (email.length > 254 || password.length > 1024) throw badRequest('E-mail ou senha inválidos.');
    const result = await users.login({ email, password }, ip);
    sendData(
        res,
        200,
        { user: result.user, csrfToken: result.csrfToken },
        { 'Set-Cookie': sessionCookie(result.token) }
    );
}

export async function me({ res, user, session }) {
    sendData(res, 200, { user, csrfToken: session.csrfToken });
}

export async function updateMe({ res, user, body, ip }) {
    const fullName = parsePersonName(body.fullName, 'Nome');
    sendData(res, 200, { user: await users.updateOwnProfile(user, { fullName }, ip) });
}

export async function changePassword({ res, user, session, body, ip }) {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = parsePassword(body.newPassword, 'A nova senha');
    await users.changePassword(user, session.id, { currentPassword, newPassword }, ip);
    sendData(res, 200, { message: 'Senha alterada com sucesso.' });
}

export async function logout({ req, res, user, ip }) {
    await users.logout(user, readSessionToken(req), ip);
    sendData(res, 200, { message: 'Sessão encerrada.' }, { 'Set-Cookie': clearedSessionCookie() });
}
