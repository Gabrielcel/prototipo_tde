// Aplica as migrações em database/migrations (em ordem) e controla o que já foi executado.
// Preserva bancos criados pela versão original: se as tabelas já existem, as migrações 001 e 002
// são marcadas como aplicadas sem serem executadas de novo.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const root = resolve(fileURLToPath(new URL('../../database/', import.meta.url)));
const env = process.env;

if (!env.PGHOST || !env.PGDATABASE || !env.PGUSER || !env.PGPASSWORD) {
    console.error('Defina PGHOST, PGDATABASE, PGUSER e PGPASSWORD no arquivo backend/.env.');
    process.exit(1);
}

const client = new pg.Client({
    host: env.PGHOST,
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    ssl: env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
});

async function tableExists(name) {
    const result = await client.query('SELECT to_regclass($1) AS found', [`public.${name}`]);
    return Boolean(result.rows[0].found);
}

async function main() {
    await client.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const files = (await readdir(resolve(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

    if (!applied.size && (await tableExists('users'))) {
        // Banco criado manualmente com os scripts da versão original.
        const baseline = ['001_schema.sql'];
        if (await tableExists('user_sessions')) baseline.push('002_user_sessions.sql');
        for (const name of baseline) {
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
            applied.add(name);
            console.log(`Banco existente detectado: ${name} marcada como aplicada.`);
        }
    }

    let count = 0;
    for (const file of files) {
        if (applied.has(file)) continue;
        console.log(`Aplicando ${file}...`);
        const sql = await readFile(resolve(root, 'migrations', file), 'utf8');
        try {
            await client.query(sql);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw new Error(`Falha em ${file}: ${error.message}`);
        }
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        count += 1;
    }
    console.log(count ? `${count} migração(ões) aplicada(s).` : 'Banco já está atualizado.');

    if (process.argv.includes('--seed-demo')) {
        if (env.NODE_ENV === 'production') throw new Error('Dados de demonstração não são permitidos em produção.');
        await client.query(await readFile(resolve(root, 'seeds', 'demo.sql'), 'utf8'));
        console.log('Dados fictícios de demonstração inseridos (DEMO-0001 a DEMO-0003).');
    }
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => client.end());
