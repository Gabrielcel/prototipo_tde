import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD, bootstrapManager, createVolunteer, startTestApp } from './helpers.js';

let app;
before(async () => {
    app = await startTestApp({ LOGIN_MAX_FAILURES_ACCOUNT: '5', LOGIN_MAX_FAILURES_IP: '1000' });
});
after(() => app.stop());

describe('autenticação', () => {
    test('status indica sistema não inicializado e rotas protegidas exigem sessão', async () => {
        const anon = app.client();
        assert.equal((await anon.get('/api/v1/auth/status')).json.data.initialized, false);
        assert.equal((await anon.get('/api/v1/families')).status, 401);
        assert.equal((await anon.get('/api/v1/auth/me')).status, 401);
    });

    test('cria o primeiro gestor e impede um segundo gestor inicial', async () => {
        const manager = await bootstrapManager(app);
        assert.ok(manager.cookie);
        const me = await manager.get('/api/v1/auth/me');
        assert.equal(me.json.data.user.role, 'gestor');
        const second = await app.client().post('/api/v1/auth/bootstrap', {
            fullName: 'Outro Gestor',
            email: 'outro@example.org',
            password: PASSWORD,
        });
        assert.equal(second.status, 409);
        assert.equal(second.json.error.code, 'ALREADY_INITIALIZED');
    });

    test('cookie de sessão é HttpOnly e SameSite', async () => {
        const result = await app
            .client()
            .post('/api/v1/auth/login', { email: 'gestor@example.org', password: PASSWORD });
        const cookie = result.headers.get('set-cookie');
        assert.match(cookie, /HttpOnly/);
        assert.match(cookie, /SameSite=Lax/);
    });

    test('login: senha errada e e-mail inexistente recebem a mesma resposta', async () => {
        const wrong = await app.client().login('gestor@example.org', 'senha-errada-1');
        const unknown = await app.client().login('naoexiste@example.org', 'senha-errada-1');
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.deepEqual(wrong.json, unknown.json);
    });

    test('conta inativa não consegue entrar e a resposta não revela o motivo', async () => {
        const manager = app.client();
        await manager.login('gestor@example.org');
        const volunteer = await createVolunteer(manager, 'Ana Inativa', 'ana@example.org');
        await manager.patch(`/api/v1/users/${volunteer.id}/status`, { status: 'inativo' });
        const attempt = await app.client().login('ana@example.org');
        assert.equal(attempt.status, 401);
        assert.equal(attempt.json.error.code, 'INVALID_CREDENTIALS');
    });

    test('exige token CSRF nas operações de escrita', async () => {
        const manager = app.client();
        await manager.login('gestor@example.org');
        const noToken = await manager.request('POST', '/api/v1/users', {}, { 'X-CSRF-Token': 'invalido' });
        assert.equal(noToken.status, 403);
        const badOrigin = await manager.request(
            'POST',
            '/api/v1/auth/logout',
            {},
            { Origin: 'https://malicioso.example' }
        );
        assert.equal(badOrigin.status, 403);
    });

    test('tentativas repetidas bloqueiam temporariamente a conta (429) sem bloqueio permanente', async () => {
        const target = app.client();
        for (let i = 0; i < 5; i += 1)
            assert.equal((await target.login('bloqueio@example.org', 'errada-123')).status, 401);
        const blocked = await target.login('bloqueio@example.org', 'errada-123');
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get('retry-after')) > 0);
        // outra conta segue funcionando
        assert.equal((await app.client().login('gestor@example.org')).status, 200);
        // o bloqueio expira: simula a passagem do tempo envelhecendo os registros
        await app.query(
            `UPDATE login_attempts SET created_at = NOW() - INTERVAL '1 hour' WHERE email_key = 'bloqueio@example.org'`
        );
        assert.equal((await target.login('bloqueio@example.org', 'errada-123')).status, 401);
    });

    test('alterar senha: valida a atual, encerra outras sessões e mantém a atual', async () => {
        const manager = app.client();
        await manager.login('gestor@example.org');
        const volunteer = await createVolunteer(manager, 'Carlos Senha', 'carlos@example.org');
        assert.ok(volunteer.id);
        const first = app.client();
        const second = app.client();
        await first.login('carlos@example.org');
        await second.login('carlos@example.org');

        assert.equal(
            (
                await first.patch('/api/v1/auth/password', {
                    currentPassword: 'errada-123',
                    newPassword: 'NovaSenha-456',
                })
            ).status,
            400
        );
        assert.equal(
            (await first.patch('/api/v1/auth/password', { currentPassword: PASSWORD, newPassword: 'curta' })).status,
            400
        );
        assert.equal(
            (await first.patch('/api/v1/auth/password', { currentPassword: PASSWORD, newPassword: 'NovaSenha-456' }))
                .status,
            200
        );

        assert.equal((await first.get('/api/v1/auth/me')).status, 200);
        assert.equal((await second.get('/api/v1/auth/me')).status, 401);
        assert.equal((await app.client().login('carlos@example.org', PASSWORD)).status, 401);
        assert.equal((await app.client().login('carlos@example.org', 'NovaSenha-456')).status, 200);
    });

    test('logout encerra a sessão; sessão expirada é rejeitada', async () => {
        const client = app.client();
        await client.login('gestor@example.org');
        assert.equal((await client.post('/api/v1/auth/logout')).status, 200);
        const stale = app.client();
        await stale.login('gestor@example.org');
        await app.query(`UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 minute'`);
        assert.equal((await stale.get('/api/v1/auth/me')).status, 401);
    });

    test('desativar usuário derruba suas sessões imediatamente', async () => {
        const manager = app.client();
        await manager.login('gestor@example.org');
        const user = await createVolunteer(manager, 'Davi Sessao', 'davi@example.org');
        const session = app.client();
        await session.login('davi@example.org');
        assert.equal((await session.get('/api/v1/auth/me')).status, 200);
        await manager.patch(`/api/v1/users/${user.id}/status`, { status: 'inativo' });
        assert.equal((await session.get('/api/v1/auth/me')).status, 401);
    });

    test('auditoria registra login, falha de login e é protegida contra alteração', async () => {
        const rows = await app.query(`SELECT action, result FROM audit_logs WHERE action = 'auth.login'`);
        assert.ok(rows.rows.some((r) => r.result === 'success'));
        assert.ok(rows.rows.some((r) => r.result === 'failure'));
        await assert.rejects(app.query(`UPDATE audit_logs SET action = 'x'`), /não podem ser alterados/);
        await assert.rejects(app.query(`DELETE FROM audit_logs`), /não podem ser alterados/);
        await assert.rejects(app.query(`TRUNCATE audit_logs`), /não podem ser alterados/);
    });
});
