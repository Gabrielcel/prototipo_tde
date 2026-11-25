import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapManager, createFamily, createVolunteer, startTestApp } from './helpers.js';

let app;
let manager;
before(async () => {
    app = await startTestApp();
    manager = await bootstrapManager(app);
    await createVolunteer(manager, 'Voluntaria Seg', 'seg@example.org');
});
after(() => app.stop());

describe('segurança da API', () => {
    test('cabeçalhos de segurança presentes na API e nos arquivos', async () => {
        const api = await fetch(`${app.baseUrl}/api/health`);
        for (const name of [
            'content-security-policy',
            'x-content-type-options',
            'referrer-policy',
            'x-frame-options',
        ]) {
            assert.ok(api.headers.get(name), name);
        }
        assert.match(api.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        assert.match(api.headers.get('content-security-policy'), /script-src 'self'/);
        assert.equal(api.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await api.json(), { status: 'ok' });
        const page = await fetch(`${app.baseUrl}/`);
        assert.ok(page.headers.get('content-security-policy'));
    });

    test('injeção de SQL em busca, filtros e identificadores não tem efeito', async () => {
        await createFamily(manager);
        const attempts = ["'; DROP TABLE families; --", "' OR '1'='1", "%' UNION SELECT * FROM users --"];
        for (const attempt of attempts) {
            const search = await manager.get(`/api/v1/families?search=${encodeURIComponent(attempt)}`);
            assert.equal(search.status, 200);
            assert.equal(search.json.data.length, 0);
        }
        assert.equal((await manager.get(`/api/v1/families/${encodeURIComponent("1' OR '1'='1")}`)).status, 400);
        assert.equal((await manager.get(`/api/v1/visits?status=${encodeURIComponent("x' OR 1=1")}`)).status, 400);
        const count = await app.query('SELECT COUNT(*)::int AS n FROM families');
        assert.ok(count.rows[0].n >= 1);
    });

    test('HTML malicioso é rejeitado nos nomes e armazenado literalmente nos textos livres', async () => {
        const rejected = await createFamily(manager, { contactName: '<script>alert(1)</script>' });
        assert.equal(rejected.status, 400);
        const stored = await createFamily(manager, { street: '<img src=x onerror=alert(1)>, 10' });
        assert.equal(stored.status, 201);
        assert.equal(stored.json.data.street, '<img src=x onerror=alert(1)>, 10'); // escapado na interface
    });

    test('corpo malformado, grande ou com tipo errado recebe o código HTTP adequado', async () => {
        const raw = (body, type = 'application/json') =>
            fetch(`${app.baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': type }, body });
        assert.equal((await raw('{invalido')).status, 400);
        assert.equal((await raw('[]')).status, 400);
        assert.equal((await raw('{"email":"a"}', 'text/plain')).status, 415);
        assert.equal((await raw(JSON.stringify({ email: 'a'.repeat(70000) }))).status, 413);
        assert.equal((await manager.request('DELETE', '/api/v1/families')).status, 405);
        assert.equal((await manager.get('/api/v1/rota-inexistente')).status, 404);
        assert.equal((await fetch(`${app.baseUrl}/api/v1/families`, { method: 'PUT' })).status, 405);
    });

    test('erros internos não vazam detalhes e dados fora do formato são tratados', async () => {
        const wrongTypes = await manager.post('/api/v1/families', {
            contactName: { $ne: null },
            phone: 123,
            members: 'x',
            consentGiven: 'sim',
        });
        assert.equal(wrongTypes.status, 400);
        assert.ok(!wrongTypes.text.includes('stack'));
        const result = await manager.post('/api/v1/visits', { familyId: 'x', scheduledAt: 5, priority: [] });
        assert.equal(result.status, 400);
        assert.ok(result.json.error.message);
    });

    test('arquivos estáticos: bloqueia travessia de diretório e pastas não públicas', async () => {
        for (const path of [
            '/../backend/.env',
            '/..%2f..%2fbackend%2f.env',
            '/%2e%2e/backend/package.json',
            '/backend/package.json',
            '/.env',
        ]) {
            const response = await fetch(`${app.baseUrl}${path}`);
            assert.ok([400, 403, 404].includes(response.status), `${path} -> ${response.status}`);
            const text = await response.text();
            assert.ok(!text.includes('PGPASSWORD'));
        }
        assert.equal((await fetch(`${app.baseUrl}/`)).status, 200);
    });

    test('credenciais: hash scrypt armazenado e nunca devolvido pela API', async () => {
        const row = await app.query(`SELECT password_hash FROM users WHERE email = 'seg@example.org'`);
        assert.match(row.rows[0].password_hash, /^scrypt\$\d+\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
        const users = await manager.get('/api/v1/users');
        assert.ok(!users.text.includes('scrypt$'));
        assert.ok(!users.text.includes('password'));
    });

    test('exclusão de registros históricos é bloqueada pelo banco', async () => {
        const family = (await createFamily(manager)).json.data;
        await assert.rejects(
            app.query('DELETE FROM families WHERE id = $1', [family.id]),
            /family_members_family_id_fkey|violates foreign key/
        );
    });
});
