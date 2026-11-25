import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD, bootstrapManager, createFamily, createVolunteer, futureInstant, startTestApp } from './helpers.js';

let app;
let manager;
let volunteer;
let volunteerClient;
before(async () => {
    app = await startTestApp();
    manager = await bootstrapManager(app);
    volunteer = await createVolunteer(manager, 'Vera Voluntaria', 'vera@example.org');
    volunteerClient = app.client();
    await volunteerClient.login('vera@example.org');
});
after(() => app.stop());

describe('usuários e permissões', () => {
    test('voluntário não lista nem cria usuários, mas vê o diretório mínimo', async () => {
        assert.equal((await volunteerClient.get('/api/v1/users')).status, 403);
        const created = await volunteerClient.post('/api/v1/users', {
            fullName: 'Intruso Teste',
            email: 'intruso@example.org',
            password: PASSWORD,
            role: 'gestor',
        });
        assert.equal(created.status, 403);
        const directory = await volunteerClient.get('/api/v1/users/directory');
        assert.equal(directory.status, 200);
        assert.ok(directory.json.data.length >= 2);
        assert.equal(directory.json.data[0].email, undefined);
    });

    test('gestor cadastra voluntário e gestor, valida dados e bloqueia e-mail repetido', async () => {
        const manager2 = await manager.post('/api/v1/users', {
            fullName: 'Segundo Gestor',
            email: 'gestor2@example.org',
            password: PASSWORD,
            role: 'gestor',
        });
        assert.equal(manager2.status, 201);
        assert.equal(manager2.json.data.password_hash, undefined);
        const dup = await manager.post('/api/v1/users', {
            fullName: 'Duplicado',
            email: 'GESTOR2@example.org',
            password: PASSWORD,
            role: 'voluntario',
        });
        assert.equal(dup.status, 409);
        assert.equal(
            (await manager.post('/api/v1/users', { fullName: 'X', email: 'x', password: '1', role: 'voluntario' }))
                .status,
            400
        );
        assert.equal(
            (
                await manager.post('/api/v1/users', {
                    fullName: 'Perfil Ruim',
                    email: 'pr@example.org',
                    password: PASSWORD,
                    role: 'admin',
                })
            ).status,
            400
        );
    });

    test('impede autodesativação e a remoção do último gestor ativo', async () => {
        const me = (await manager.get('/api/v1/auth/me')).json.data.user;
        const self = await manager.patch(`/api/v1/users/${me.id}/status`, { status: 'inativo' });
        assert.equal(self.status, 409);
        assert.equal(self.json.error.code, 'SELF_DEACTIVATION');

        const list = await manager.get('/api/v1/users?role=gestor');
        const other = list.json.data.find((u) => u.email === 'gestor2@example.org');
        assert.equal((await manager.patch(`/api/v1/users/${other.id}/status`, { status: 'inativo' })).status, 200);
        const otherClient = app.client();
        assert.equal((await otherClient.login('gestor2@example.org')).status, 401);
        assert.equal((await manager.patch(`/api/v1/users/${other.id}/status`, { status: 'ativo' })).status, 200);
        assert.equal((await otherClient.login('gestor2@example.org')).status, 200);
        // com dois gestores ativos, rebaixar um é permitido; o último não
        assert.equal((await manager.patch(`/api/v1/users/${other.id}`, { role: 'voluntario' })).status, 200);
        assert.equal((await manager.patch(`/api/v1/users/${me.id}`, { role: 'voluntario' })).status, 409);
    });

    test('desativar voluntário devolve suas visitas abertas para distribuição, com histórico', async () => {
        const temp = await createVolunteer(manager, 'Tiago Temporario', 'tiago@example.org');
        const family = (await createFamily(manager)).json.data;
        const visit = await manager.post('/api/v1/visits', {
            familyId: family.id,
            scheduledAt: futureInstant(10),
            priority: 'media',
            assignedTo: temp.id,
        });
        assert.equal(visit.status, 201);
        const result = await manager.patch(`/api/v1/users/${temp.id}/status`, { status: 'inativo' });
        assert.equal(result.json.data.releasedVisits, 1);
        const detail = await manager.get(`/api/v1/visits/${visit.json.data.id}`);
        assert.equal(detail.json.data.status, 'sem_responsavel');
        assert.ok(detail.json.data.history.some((h) => h.action === 'desatribuida'));
    });
});

describe('famílias', () => {
    test('cadastra família com integrantes, normaliza telefone/CEP e gera histórico', async () => {
        const result = await createFamily(manager, {
            contactName: 'Maria das Dores Silva',
            phone: '88999990001',
            postalCode: '63180000',
            email: 'MARIA@Example.org',
            members: [
                { fullName: 'João Silva', relationship: 'Filho(a)', birthDate: '2012-05-01' },
                { fullName: 'Lia Silva', relationship: 'Filho(a)', birthDate: '2015-08-09' },
            ],
        });
        assert.equal(result.status, 201);
        const family = result.json.data;
        assert.equal(family.phone, '(88) 99999-0001');
        assert.equal(family.postalCode, '63180-000');
        assert.equal(family.email, 'maria@example.org');
        assert.match(family.code, /^\d{4}$/);
        const detail = (await manager.get(`/api/v1/families/${family.id}`)).json.data;
        assert.equal(detail.members.length, 3);
        assert.equal(detail.members[0].relationship, 'Responsável');
        assert.equal(detail.birthDate, '1985-03-12');
        const history = await manager.get(`/api/v1/families/${family.id}/history`);
        assert.equal(history.json.data[0].action, 'cadastro');
    });

    test('valida campos obrigatórios, telefone, e-mail, CEP, nascimento e consentimento', async () => {
        const base = {
            contactName: 'Pessoa Valida',
            birthDate: '1990-01-01',
            phone: '(88) 98888-7777',
            street: 'Rua A, 1',
            neighborhood: 'Centro',
            city: 'Barbalha',
            consentGiven: true,
            members: [],
        };
        const bad = async (overrides) => (await manager.post('/api/v1/families', { ...base, ...overrides })).status;
        assert.equal(await bad({ consentGiven: false }), 400);
        assert.equal(await bad({ contactName: '' }), 400);
        assert.equal(await bad({ contactName: 'Nome123' }), 400);
        assert.equal(await bad({ phone: '123' }), 400);
        assert.equal(await bad({ email: 'sem-arroba' }), 400);
        assert.equal(await bad({ postalCode: '123' }), 400);
        assert.equal(await bad({ birthDate: '2999-01-01' }), 400);
        assert.equal(await bad({ birthDate: '2023-02-30' }), 400);
        assert.equal(await bad({ birthDate: undefined }), 400);
        assert.equal(await bad({ incomeRange: 'milionario' }), 400);
        assert.equal(
            await bad({
                members: [
                    { fullName: 'Ana', relationship: 'Filho(a)' },
                    { fullName: 'ana', relationship: 'Outro' },
                ],
            }),
            400
        );
        assert.equal(await bad({ members: [{ fullName: 'Fulano', relationship: 'Responsável' }] }), 400);
        assert.equal(
            await bad({ members: [{ fullName: 'Bebe', relationship: 'Filho(a)', birthDate: '2999-01-01' }] }),
            400
        );
    });

    test('detecta possível duplicidade e permite confirmar o cadastro', async () => {
        const first = await createFamily(manager, { contactName: 'Rosa Duplicada', phone: '(88) 97777-1234' });
        assert.equal(first.status, 201);
        const again = await createFamily(manager, { contactName: 'Outra Pessoa', phone: '(88) 97777-1234' });
        assert.equal(again.status, 409);
        assert.equal(again.json.error.code, 'POSSIBLE_DUPLICATE');
        assert.equal(again.json.error.details.candidates[0].samePhone, true);
        const confirmed = await createFamily(manager, {
            contactName: 'Outra Pessoa',
            phone: '(88) 97777-1234',
            confirmDuplicate: true,
        });
        assert.equal(confirmed.status, 201);
    });

    test('edição registra histórico com valor anterior e novo; integrantes: adicionar, editar, remover', async () => {
        const family = (await createFamily(manager, { contactName: 'Helena Editavel' })).json.data;
        const edit = await manager.patch(`/api/v1/families/${family.id}`, {
            neighborhood: 'Novo Bairro',
            status: 'aguardando_visita',
        });
        assert.equal(edit.status, 200);
        const history = (await manager.get(`/api/v1/families/${family.id}/history`)).json.data;
        const change = history.find((h) => h.field === 'Bairro');
        assert.equal(change.oldValue, 'Centro');
        assert.equal(change.newValue, 'Novo Bairro');
        assert.equal((await manager.patch(`/api/v1/families/${family.id}`, {})).status, 400);

        const added = await manager.post(`/api/v1/families/${family.id}/members`, {
            fullName: 'Pedro Novo',
            relationship: 'Filho(a)',
            birthDate: '2018-01-01',
        });
        assert.equal(added.status, 201);
        assert.equal(
            (
                await manager.post(`/api/v1/families/${family.id}/members`, {
                    fullName: 'pedro novo',
                    relationship: 'Outro',
                })
            ).status,
            400
        );
        const memberId = added.json.data.id;
        const renamed = await manager.patch(`/api/v1/families/${family.id}/members/${memberId}`, {
            relationship: 'Neto(a)',
            birthDate: '2017-12-31',
        });
        assert.equal(renamed.json.data.relationship, 'Neto(a)');
        assert.equal((await manager.delete(`/api/v1/families/${family.id}/members/${memberId}`)).status, 200);

        const detail = (await manager.get(`/api/v1/families/${family.id}`)).json.data;
        const responsible = detail.members.find((m) => m.relationship === 'Responsável');
        assert.equal((await manager.delete(`/api/v1/families/${family.id}/members/${responsible.id}`)).status, 409);
        const actions = (await manager.get(`/api/v1/families/${family.id}/history`)).json.data.map((h) => h.action);
        assert.ok(actions.includes('integrante_adicionado') && actions.includes('integrante_removido'));
    });

    test('voluntário só acessa famílias com visita aberta (ou recém-concluída) atribuída a ele', async () => {
        const mine = (await createFamily(manager)).json.data;
        const other = (await createFamily(manager)).json.data;
        await manager.post('/api/v1/visits', {
            familyId: mine.id,
            scheduledAt: futureInstant(12),
            priority: 'alta',
            assignedTo: volunteer.id,
        });

        assert.equal((await volunteerClient.get(`/api/v1/families/${mine.id}`)).status, 200);
        assert.equal((await volunteerClient.get(`/api/v1/families/${other.id}`)).status, 404);
        const list = (await volunteerClient.get('/api/v1/families?limit=200')).json.data.map((f) => f.id);
        assert.ok(list.includes(mine.id));
        assert.ok(!list.includes(other.id));
        assert.equal((await volunteerClient.post('/api/v1/families', {})).status, 403);
        assert.equal((await volunteerClient.patch(`/api/v1/families/${mine.id}`, { city: 'X' })).status, 403);

        // visita cancelada não concede acesso
        const visits = (await manager.get(`/api/v1/visits?familyId=${mine.id}`)).json.data;
        await manager.patch(`/api/v1/visits/${visits[0].id}`, { status: 'cancelada', reason: 'Família viajou' });
        assert.equal((await volunteerClient.get(`/api/v1/families/${mine.id}`)).status, 404);
    });

    test('paginação e busca de famílias', async () => {
        const page = await manager.get('/api/v1/families?limit=2&page=1');
        assert.equal(page.status, 200);
        assert.equal(page.json.data.length, 2);
        assert.ok(page.json.pagination.total >= 5);
        assert.ok(page.json.pagination.totalPages >= 3);
        const search = await manager.get('/api/v1/families?search=Helena');
        assert.equal(search.json.data.length, 1);
        assert.equal((await manager.get('/api/v1/families?limit=9999')).status, 400);
        assert.equal((await manager.get('/api/v1/families?page=0')).status, 400);
        assert.equal((await manager.get('/api/v1/families/nao-e-uuid')).status, 400);
    });
});
