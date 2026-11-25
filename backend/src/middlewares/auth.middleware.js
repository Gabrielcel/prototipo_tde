import { findSession, verifyCsrfToken } from '../services/auth.service.js';
import { forbidden, unauthorized } from '../utils/errors.js';

/** Exige sessão válida (e CSRF em operações de escrita) e confere o perfil permitido. */
export async function authenticate(request, { csrf, roles }) {
    const session = await findSession(request);
    if (!session) throw unauthorized();
    if (csrf && !verifyCsrfToken(session.csrfToken, request.headers['x-csrf-token'])) {
        throw forbidden('Token de segurança ausente ou inválido. Recarregue a página.');
    }
    if (roles && !roles.includes(session.user.role)) {
        throw forbidden('Esta ação não está disponível para o seu perfil.');
    }
    return session;
}
