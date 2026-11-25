import { query, withTransaction, advisoryLock } from '../config/database.js';
import { badRequest, conflict, forbidden, notFound, ApiError } from '../utils/errors.js';
import { audit, auditSafe } from './audit.service.js';
import {
    assertLoginAllowed,
    burnPasswordCheck,
    createSession,
    deleteSessionByToken,
    deleteUserSessions,
    hashPassword,
    recordLoginAttempt,
    verifyPassword,
} from './auth.service.js';

const BOOTSTRAP_LOCK = 'users:bootstrap';

const publicUser = (row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
});

const USER_COLUMNS = 'id, full_name, email, role, status, last_login_at, created_at';

export async function isInitialized() {
    const result = await query('SELECT EXISTS (SELECT 1 FROM users) AS initialized');
    return result.rows[0].initialized;
}

async function insertAccount(client, account, role) {
    const result = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
        [account.fullName, account.email, await hashPassword(account.password), role]
    );
    return publicUser(result.rows[0]);
}

export async function createInitialManager(account, ip) {
    try {
        return await withTransaction(async (client) => {
            await advisoryLock(client, BOOTSTRAP_LOCK);
            const existing = await client.query('SELECT 1 FROM users LIMIT 1');
            if (existing.rowCount) throw conflict('A configuração inicial já foi concluída.', 'ALREADY_INITIALIZED');
            const user = await insertAccount(client, account, 'gestor');
            const session = await createSession(user.id, client);
            await audit(client, {
                userId: user.id,
                action: 'auth.bootstrap',
                resourceType: 'user',
                resourceId: user.id,
                ip,
            });
            return { user, ...session };
        });
    } catch (error) {
        if (error.code === '23505') throw conflict('Este e-mail já está cadastrado.', 'DUPLICATE_EMAIL');
        throw error;
    }
}

const INVALID_CREDENTIALS = () => new ApiError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');

export async function login({ email, password }, ip) {
    await assertLoginAllowed(email, ip);

    const result = await query(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE LOWER(email) = $1`, [email]);
    const row = result.rows[0];

    let reason = null;
    if (!row) {
        await burnPasswordCheck(password);
        reason = 'unknown_email';
    } else if (!(await verifyPassword(password, row.password_hash))) {
        reason = 'wrong_password';
    } else if (row.status !== 'ativo') {
        reason = 'inactive_account';
    }

    if (reason) {
        await recordLoginAttempt(email, ip, false);
        await auditSafe({
            userId: row?.id,
            action: 'auth.login',
            resourceType: 'user',
            resourceId: row?.id,
            result: 'failure',
            ip,
            metadata: { reason },
        });
        // A resposta é igual para e-mail inexistente, senha errada e conta inativa.
        throw INVALID_CREDENTIALS();
    }

    const session = await withTransaction(async (client) => {
        await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);
        const created = await createSession(row.id, client);
        await audit(client, { userId: row.id, action: 'auth.login', resourceType: 'user', resourceId: row.id, ip });
        return created;
    });
    await recordLoginAttempt(email, ip, true);
    return { user: publicUser(row), ...session };
}

export async function logout(user, token, ip) {
    await deleteSessionByToken(token);
    await auditSafe({ userId: user.id, action: 'auth.logout', resourceType: 'user', resourceId: user.id, ip });
}

export async function updateOwnProfile(user, { fullName }, ip) {
    const result = await query(`UPDATE users SET full_name = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`, [
        user.id,
        fullName,
    ]);
    await auditSafe({ userId: user.id, action: 'user.update_profile', resourceType: 'user', resourceId: user.id, ip });
    return publicUser(result.rows[0]);
}

export async function changePassword(user, sessionId, { currentPassword, newPassword }, ip) {
    if (!currentPassword) throw badRequest('Informe sua senha atual.');
    if (currentPassword === newPassword) {
        throw badRequest('A nova senha precisa ser diferente da senha atual.');
    }
    const found = await query(`SELECT password_hash FROM users WHERE id = $1 AND status = 'ativo'`, [user.id]);
    const account = found.rows[0];
    if (!account || !(await verifyPassword(currentPassword, account.password_hash))) {
        await auditSafe({
            userId: user.id,
            action: 'auth.change_password',
            resourceType: 'user',
            resourceId: user.id,
            result: 'failure',
            ip,
            metadata: { reason: 'wrong_current_password' },
        });
        throw badRequest('A senha atual está incorreta.');
    }

    const newHash = await hashPassword(newPassword);
    await withTransaction(async (client) => {
        const updated = await client.query(
            `UPDATE users SET password_hash = $2
             WHERE id = $1 AND password_hash = $3 AND status = 'ativo'`,
            [user.id, newHash, account.password_hash]
        );
        if (!updated.rowCount) {
            throw conflict('A senha da conta mudou durante a solicitação. Tente novamente.', 'RETRY');
        }
        // Política: a sessão usada na alteração continua ativa; todas as outras são encerradas.
        await deleteUserSessions(user.id, sessionId, client);
        await audit(client, {
            userId: user.id,
            action: 'auth.change_password',
            resourceType: 'user',
            resourceId: user.id,
            ip,
        });
    });
}

export async function createUser(manager, { fullName, email, password, role }, ip) {
    try {
        return await withTransaction(async (client) => {
            const user = await insertAccount(client, { fullName, email, password }, role);
            await audit(client, {
                userId: manager.id,
                action: 'user.create',
                resourceType: 'user',
                resourceId: user.id,
                ip,
                metadata: { role },
            });
            return user;
        });
    } catch (error) {
        if (error.code === '23505') throw conflict('Este e-mail já está cadastrado.', 'DUPLICATE_EMAIL');
        throw error;
    }
}

export async function listUsers({ limit, offset }, filters = {}) {
    const conditions = [];
    const values = [];
    if (filters.status) {
        values.push(filters.status);
        conditions.push(`status = $${values.length}`);
    }
    if (filters.role) {
        values.push(filters.role);
        conditions.push(`role = $${values.length}`);
    }
    if (filters.search) {
        values.push(`%${filters.search}%`);
        conditions.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await query(`SELECT COUNT(*)::int AS total FROM users ${where}`, values);
    const rows = await query(
        `SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY full_name
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );
    return { total: total.rows[0].total, items: rows.rows.map(publicUser) };
}

/** Diretório mínimo (sem e-mail) para escolher responsáveis. */
export async function userDirectory() {
    const result = await query(`SELECT id, full_name, role FROM users WHERE status = 'ativo' ORDER BY full_name`);
    return result.rows.map((row) => ({ id: row.id, fullName: row.full_name, role: row.role }));
}

async function countOtherActiveManagers(client, userId) {
    const result = await client.query(
        `SELECT COUNT(*)::int AS total FROM users WHERE role = 'gestor' AND status = 'ativo' AND id <> $1`,
        [userId]
    );
    return result.rows[0].total;
}

async function lockUser(client, userId) {
    const result = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!result.rows[0]) throw notFound('Usuário não encontrado.');
    return result.rows[0];
}

export async function updateUser(manager, userId, changes, ip) {
    return withTransaction(async (client) => {
        await advisoryLock(client, 'users:managers');
        const current = await lockUser(client, userId);
        const next = { fullName: changes.fullName ?? current.full_name, role: changes.role ?? current.role };

        if (next.role !== current.role && current.role === 'gestor') {
            if (current.id === manager.id)
                throw conflict('Você não pode alterar o próprio perfil.', 'SELF_ROLE_CHANGE');
            if (current.status === 'ativo' && !(await countOtherActiveManagers(client, current.id))) {
                throw conflict('É necessário manter ao menos um gestor ativo.', 'LAST_MANAGER');
            }
        }
        if (next.role !== current.role && current.id === manager.id) {
            throw conflict('Você não pode alterar o próprio perfil.', 'SELF_ROLE_CHANGE');
        }

        const updated = await client.query(
            `UPDATE users SET full_name = $2, role = $3 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
            [userId, next.fullName, next.role]
        );
        if (next.role !== current.role) {
            await deleteUserSessions(userId, null, client); // permissões mudaram: reautenticar
        }
        await audit(client, {
            userId: manager.id,
            action: 'user.update',
            resourceType: 'user',
            resourceId: userId,
            ip,
            metadata: { fromRole: current.role, toRole: next.role },
        });
        return publicUser(updated.rows[0]);
    });
}

export async function updateUserStatus(manager, userId, status, ip) {
    return withTransaction(async (client) => {
        await advisoryLock(client, 'users:managers');
        const current = await lockUser(client, userId);
        if (current.id === manager.id && status === 'inativo') {
            throw conflict('Não é possível desativar a própria conta.', 'SELF_DEACTIVATION');
        }
        if (
            status === 'inativo' &&
            current.role === 'gestor' &&
            current.status === 'ativo' &&
            !(await countOtherActiveManagers(client, current.id))
        ) {
            throw conflict('É necessário manter ao menos um gestor ativo.', 'LAST_MANAGER');
        }

        const updated = await client.query(`UPDATE users SET status = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`, [
            userId,
            status,
        ]);

        let releasedVisits = 0;
        if (status === 'inativo') {
            await deleteUserSessions(userId, null, client);
            // Visitas abertas do usuário voltam para distribuição, com histórico.
            const released = await client.query(
                `UPDATE visits SET assigned_to = NULL, status = 'sem_responsavel'
                 WHERE assigned_to = $1 AND status IN ('agendada', 'reagendada')
                 RETURNING id, scheduled_at`,
                [userId]
            );
            releasedVisits = released.rowCount;
            for (const visit of released.rows) {
                await client.query(
                    `INSERT INTO visit_history (visit_id, user_id, action, old_scheduled_at, new_scheduled_at,
                                                old_assigned_to, new_assigned_to, reason)
                     VALUES ($1, $2, 'desatribuida', $3, $3, $4, NULL, 'Usuário desativado')`,
                    [visit.id, manager.id, visit.scheduled_at, userId]
                );
            }
        }
        await audit(client, {
            userId: manager.id,
            action: status === 'ativo' ? 'user.activate' : 'user.deactivate',
            resourceType: 'user',
            resourceId: userId,
            ip,
            metadata: { releasedVisits },
        });
        return { user: publicUser(updated.rows[0]), releasedVisits };
    });
}

export function assertCanAssignRole(manager, role) {
    if (manager.role !== 'gestor' && role === 'gestor') throw forbidden('Somente gestores criam gestores.');
}
