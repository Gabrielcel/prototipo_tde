import { createSession, hashPassword, verifyPassword } from './auth.js';
import { pool, query } from './db.js';

export class UserError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function validateAccount(data) {
  const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!fullName || fullName.length > 120) {
    throw new UserError(400, 'Informe um nome com até 120 caracteres.');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserError(400, 'Informe um e-mail válido.');
  }
  if (password.length < 8 || password.length > 1024) {
    throw new UserError(400, 'A senha deve ter entre 8 e 1024 caracteres.');
  }

  return { fullName, email, password };
}

function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function insertAccount(client, data, role) {
  const passwordHash = await hashPassword(data.password);
  const result = await client.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, full_name, email, role, status, created_at`,
    [data.fullName, data.email, passwordHash, role]
  );

  return publicUser(result.rows[0]);
}

export async function createInitialManager(data) {
  const account = validateAccount(data);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73190214)');

    const existing = await client.query('SELECT 1 FROM users LIMIT 1');
    if (existing.rowCount) {
      throw new UserError(409, 'A configuração inicial já foi concluída.');
    }

    const user = await insertAccount(client, account, 'gestor');
    await client.query('COMMIT');

    return { user, ...(await createSession(user.id)) };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new UserError(409, 'Este e-mail já está cadastrado.');
    throw error;
  } finally {
    client.release();
  }
}

export async function login(data) {
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!email || !password || email.length > 254 || password.length > 1024) {
    return null;
  }

  const result = await query(
    `SELECT id, full_name, email, password_hash, role, status, created_at
     FROM users
     WHERE LOWER(email) = $1`,
    [email]
  );
  const row = result.rows[0];

  if (!row || row.status !== 'ativo' || !(await verifyPassword(password, row.password_hash))) {
    return null;
  }

  return { user: publicUser(row), ...(await createSession(row.id)) };
}

export async function createUser(currentUser, data) {
  const account = validateAccount(data);
  const role = data.role || 'voluntario';

  if (!['gestor', 'voluntario'].includes(role)) {
    throw new UserError(400, 'Perfil de usuário inválido.');
  }
  if (currentUser.role !== 'gestor' && role !== 'voluntario') {
    throw new UserError(403, 'Voluntários podem cadastrar apenas outros voluntários.');
  }

  try {
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, status, created_at`,
      [account.fullName, account.email, await hashPassword(account.password), role]
    );

    return publicUser(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') throw new UserError(409, 'Este e-mail já está cadastrado.');
    throw error;
  }
}

export async function listUsers() {
  const result = await query(
    `SELECT id, full_name, role, status, created_at
     FROM users
     ORDER BY full_name`
  );

  return result.rows.map(row => ({
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function updateUserStatus(currentUser, userId, status) {
  if (currentUser.role !== 'gestor') {
    throw new UserError(403, 'Somente gestores podem alterar o acesso de usuários.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new UserError(400, 'Identificador de usuário inválido.');
  }
  if (!['ativo', 'inativo'].includes(status)) {
    throw new UserError(400, 'Situação de acesso inválida.');
  }
  if (currentUser.id === userId && status === 'inativo') {
    throw new UserError(409, 'Não é possível desativar a própria conta.');
  }

  const result = await query(
    `UPDATE users
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, role, status, created_at`,
    [userId, status]
  );

  if (!result.rows[0]) throw new UserError(404, 'Usuário não encontrado.');
  if (status === 'inativo') {
    await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }

  const row = result.rows[0];
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}
