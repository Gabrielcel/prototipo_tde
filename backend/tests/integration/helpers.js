// Ambiente de teste: cria um banco descartável, aplica as migrações e sobe o servidor.
// Requer um PostgreSQL acessível com um usuário capaz de criar bancos (variáveis PG*).
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDir = resolve(fileURLToPath(new URL('../../../database/migrations/', import.meta.url)));

export const PASSWORD = 'Senha-Segura-123';

export async function startTestApp(overrides = {}) {
    const admin = {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
    };
    if (!admin.user || !admin.password) {
        throw new Error('Defina PGUSER e PGPASSWORD para executar os testes de integração.');
    }
    const database = `sesfa_test_${randomBytes(4).toString('hex')}`;
    const adminClient = new pg.Client({ ...admin, database: 'postgres' });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${database}`);
    await adminClient.end();

    const setup = new pg.Client({ ...admin, database });
    await setup.connect();
    for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
        await setup.query(await readFile(resolve(migrationsDir, file), 'utf8'));
    }
    await setup.end();

    Object.assign(process.env, {
        NODE_ENV: 'test',
        PGDATABASE: database,
        SCRYPT_N: '16384',
        RATE_LIMIT_MAX: '100000',
        RATE_LIMIT_AUTH_MAX: '100000',
        ...overrides,
    });
    const { createHttpServer } = await import('../../src/app.js');
    const dbModule = await import('../../src/config/database.js');
    const server = createHttpServer();
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    return {
        baseUrl,
        query: dbModule.query,
        client: () => new Client(baseUrl),
        async stop() {
            server.closeAllConnections?.();
            await new Promise((done) => server.close(done));
            await dbModule.closeDatabase();
            const cleaner = new pg.Client({ ...admin, database: 'postgres' });
            await cleaner.connect();
            await cleaner.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
            await cleaner.end();
        },
    };
}

export class Client {
    cookie = null;
    csrf = null;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async request(method, path, body, headers = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(this.cookie ? { Cookie: this.cookie } : {}),
                ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
                ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) this.cookie = setCookie.startsWith('sesfa_session=;') ? null : setCookie.split(';')[0];
        const text = await response.text();
        let json = null;
        try {
            json = JSON.parse(text);
        } catch {
            /* resposta não JSON */
        }
        return { status: response.status, headers: response.headers, json, text };
    }

    get = (path) => this.request('GET', path);
    post = (path, body = {}) => this.request('POST', path, body);
    patch = (path, body) => this.request('PATCH', path, body);
    delete = (path) => this.request('DELETE', path);

    async login(email, password = PASSWORD) {
        const result = await this.post('/api/v1/auth/login', { email, password });
        if (result.status === 200) this.csrf = result.json.data.csrfToken;
        return result;
    }
}

export async function bootstrapManager(app, email = 'gestor@example.org') {
    const client = app.client();
    const result = await client.post('/api/v1/auth/bootstrap', {
        fullName: 'Gestora Teste',
        email,
        password: PASSWORD,
    });
    client.csrf = result.json.data.csrfToken;
    return client;
}

export async function createVolunteer(manager, name, email) {
    const result = await manager.post('/api/v1/users', {
        fullName: name,
        email,
        password: PASSWORD,
        role: 'voluntario',
    });
    return result.json.data;
}

export function futureInstant(days, hour = 10, minute = 0) {
    const date = new Date(Date.now() + days * 86400000);
    date.setUTCHours(hour, minute, 0, 0);
    return date.toISOString();
}

let familyCounter = 0;
export async function createFamily(manager, overrides = {}) {
    familyCounter += 1;
    const n = String(familyCounter).padStart(4, '0');
    const result = await manager.post('/api/v1/families', {
        contactName: `Responsavel Teste ${String.fromCharCode(65 + (familyCounter % 26))}${String.fromCharCode(97 + ((familyCounter * 7) % 26))}`,
        birthDate: '1985-03-12',
        phone: `(88) 9${n}-${String(1000 + familyCounter)}`,
        street: `Rua Teste, ${familyCounter}`,
        neighborhood: 'Centro',
        city: 'Barbalha',
        consentGiven: true,
        members: [],
        ...overrides,
    });
    return result;
}

export function checklist(answer = 'Sim') {
    return [
        'Moradia em condições adequadas de higiene e segurança',
        'Acesso a água potável e saneamento',
        'Alimentos disponíveis para todos os moradores',
        'Crianças e adolescentes frequentando a escola',
        'Moradores com acompanhamento de saúde em dia',
        'Documentação pessoal em dia',
    ].map((item) => ({ item, answer }));
}
