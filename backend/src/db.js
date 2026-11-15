import pg from 'pg';

const { Pool } = pg;
const hasDatabaseConfig = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'].every(
  key => Boolean(process.env[key]) && process.env[key] !== 'COLOQUE_SUA_SENHA_AQUI'
);

export const pool = hasDatabaseConfig
  ? new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      max: 5,
    })
  : null;

if (pool) {
  pool.on('error', () => {
    console.error('A conexão ociosa com PostgreSQL foi interrompida.');
  });
}

export function query(sql, values = []) {
  if (!pool) {
    throw new Error('Configure as variáveis do PostgreSQL no arquivo .env.');
  }

  return pool.query(sql, values);
}

export async function checkDatabase() {
  const result = await query('SELECT current_database() AS name');
  return result.rows[0].name;
}

export async function closeDatabase() {
  if (pool) await pool.end();
}

export async function withTransaction(work) {
  if (!pool) {
    throw new Error('Configure as variáveis do PostgreSQL no arquivo .env.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
