import pg from 'pg';
import { config } from './environment.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// DATE (nascimento etc.) permanece como texto AAAA-MM-DD, sem conversão de fuso.
pg.types.setTypeParser(1082, (value) => value);
const db = config.database;
const isConfigured = Boolean(db.host && db.name && db.user && db.password);

export const pool = isConfigured
    ? new Pool({
          host: db.host,
          port: db.port,
          database: db.name,
          user: db.user,
          password: db.password,
          ssl: db.ssl ? { rejectUnauthorized: true } : undefined,
          max: db.poolMax,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          statement_timeout: db.statementTimeoutMs,
      })
    : null;

if (pool) {
    pool.on('error', (error) => {
        logger.error('Conexão ociosa com o PostgreSQL interrompida.', { code: error.code });
    });
}

function requirePool() {
    if (!pool) throw new Error('DATABASE_NOT_CONFIGURED');
    return pool;
}

export const query = (sql, values = []) => requirePool().query(sql, values);

export async function checkDatabase() {
    await query('SELECT 1');
    return true;
}

export async function closeDatabase() {
    if (pool) await pool.end();
}

/** Executa várias operações em uma única transação, com rollback seguro em falhas. */
export async function withTransaction(work) {
    const client = await requirePool().connect();
    let broken = false;
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            // Conexão provavelmente perdida: descarta o cliente em vez de devolvê-lo ao pool.
            broken = true;
            logger.error('Falha ao desfazer a transação.', { code: rollbackError.code });
        }
        throw error;
    } finally {
        client.release(broken);
    }
}

/** Bloqueio transacional por chave textual (evita corridas em agendamentos e códigos). */
export async function advisoryLock(client, key) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
}
