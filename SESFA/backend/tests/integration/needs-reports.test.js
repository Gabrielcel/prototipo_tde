import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapManager, checklist, createFamily, createVolunteer, startTestApp } from './helpers.js';

let app;
let manager;
let vol1;
let vol2;
let c1;
let c2;
let family;
before(async () => {
    app = await startTestApp();
    manager = await bootstrapManager(app);
    vol1 = await createVolunteer(manager, 'Voluntaria Um', 'um@example.org');
    vol2 = await createVolunteer(manager, 'Voluntario Dois', 'dois@example.org');
    c1 = app.client();
    c2 = app.client();
    await c1.login('um@example.org');
    await c2.login('dois@example.org');
    family = (await createFamily(manager)).json.data;
});
after(() => app.stop());

const instant = (iso) => iso;
const schedule = (familyId, scheduledAt, assignedTo) =>
    manager.post('/api/v1/visits', { familyId, scheduledAt, priority: 'media', assignedTo });

describe('necessidades e encaminhamentos', () => {
    let needId;
    let referralA;
    let referralB;

    test('voluntário só cria necessidade em família a que tem acesso', async () => {
        const denied = await c1.post('/api/v1/needs', {
            familyId: family.id,
            category: 'Saúde',
            description: 'Consulta',
            priority: 'alta',
        });
        assert.equal(denied.status, 404);
        const future = new Date(Date.now() + 3 * 86400000).toISOString();
        await schedule(family.id, future, vol1.id);
        const created = await c1.post('/api/v1/needs', {
            familyId: family.id,
            category: 'Saúde',
            description: '  Consulta  com   cardiologista ',
            priority: 'alta',
        });
        assert.equal(created.status, 201);
        assert.equal(created.json.data.description, 'Consulta com cardiologista');
        assert.equal(created.json.data.createdBy, (await c1.get('/api/v1/auth/me')).json.data.user.id);
        needId = created.json.data.id;
        const bad = (body) =>
            c1.post('/api/v1/needs', {
                familyId: family.id,
                category: 'Saúde',
                description: 'x',
                priority: 'alta',
                ...body,
            });
        assert.equal((await bad({ category: 'Outra' })).status, 400);
        assert.equal((await bad({ priority: 'urgente' })).status, 400);
        assert.equal((await bad({ description: '' })).status, 400);
        assert.equal((await bad({ visitId: '00000000-0000-4000-8000-000000000000' })).status, 404);
    });

    test('necessidade aceita múltiplos encaminhamentos, cada um com identificador próprio', async () => {
        const a = await c1.post(`/api/v1/needs/${needId}/referrals`, {
            type: 'encaminhamento',
            responsibleUserId: vol1.id,
            description: 'UBS',
        });
        const b = await manager.post(`/api/v1/needs/${needId}/referrals`, {
            type: 'pendencia',
            responsibleUserId: vol2.id,
        });
        assert.equal(a.status, 201);
        assert.equal(b.status, 201);
        referralA = a.json.data.id;
        referralB = b.json.data.id;
        assert.notEqual(referralA, referralB);
        const need = (await manager.get(`/api/v1/needs/${needId}`)).json.data;
        assert.equal(need.referrals.length, 2);
        const inactive = await createVolunteer(manager, 'Inativo', 'inativo@example.org');
        await manager.patch(`/api/v1/users/${inactive.id}/status`, { status: 'inativo' });
        assert.equal(
            (
                await manager.post(`/api/v1/needs/${needId}/referrals`, {
                    type: 'encaminhamento',
                    responsibleUserId: inactive.id,
                })
            ).status,
            400
        );
    });

    test('encaminhamento: só o responsável (ou gestor) altera; transições validadas; histórico preservado', async () => {
        assert.equal((await c2.patch(`/api/v1/referrals/${referralA}`, { status: 'concluido' })).status, 404);
        assert.equal((await c1.patch(`/api/v1/referrals/${referralA}`, { responsibleUserId: vol2.id })).status, 403);
        assert.equal((await c1.patch(`/api/v1/referrals/${referralA}`, { status: 'em_andamento' })).status, 200);
        assert.equal((await c1.patch(`/api/v1/referrals/${referralA}`, { status: 'concluido' })).status, 200);
        // concluído só volta com gestor
        assert.equal((await c1.patch(`/api/v1/referrals/${referralA}`, { status: 'em_andamento' })).status, 403);
        assert.equal((await manager.patch(`/api/v1/referrals/${referralA}`, { status: 'em_andamento' })).status, 200);
        // cancelado → concluído é transição inválida
        await manager.patch(`/api/v1/referrals/${referralB}`, { status: 'cancelado' });
        const invalid = await manager.patch(`/api/v1/referrals/${referralB}`, { status: 'concluido' });
        assert.equal(invalid.status, 409);
        assert.equal(invalid.json.error.code, 'INVALID_TRANSITION');
        const history = (await manager.get(`/api/v1/needs/${needId}`)).json.data.history;
        assert.ok(history.filter((h) => h.entityType === 'referral').length >= 5);
        assert.ok(history.some((h) => h.from === 'aberto' && h.to === 'em_andamento'));
    });

    test('necessidade: transições, reabertura só por gestor, bloqueio de novo encaminhamento quando resolvida', async () => {
        assert.equal((await c1.patch(`/api/v1/needs/${needId}`, { status: 'em_andamento' })).status, 200);
        assert.equal((await c1.patch(`/api/v1/needs/${needId}`, { status: 'resolvida' })).status, 200);
        assert.equal((await c1.patch(`/api/v1/needs/${needId}`, { status: 'em_andamento' })).status, 403);
        const blocked = await c1.post(`/api/v1/needs/${needId}/referrals`, {
            type: 'encaminhamento',
            responsibleUserId: vol1.id,
        });
        assert.equal(blocked.status, 409);
        assert.equal((await manager.patch(`/api/v1/needs/${needId}`, { status: 'em_andamento' })).status, 200);
        // volunteer 2 não vê a necessidade; apenas o conteúdo do autor é editável pelo voluntário
        assert.equal((await c2.get(`/api/v1/needs/${needId}`)).status, 404);
        assert.equal((await c1.patch(`/api/v1/needs/${needId}`, { priority: 'baixa' })).status, 200);
        const listForTwo = (await c2.get('/api/v1/needs')).json.data;
        assert.ok(!listForTwo.some((n) => n.id === needId));
    });

    test('filtros e paginação de necessidades e encaminhamentos', async () => {
        const needs = await manager.get(
            '/api/v1/needs?status=em_andamento&priority=baixa&category=Sa%C3%BAde&hasReferral=true'
        );
        assert.equal(needs.json.data.length, 1);
        assert.equal((await manager.get('/api/v1/needs?hasReferral=talvez')).status, 400);
        const mine = await c1.get('/api/v1/referrals?mine=true');
        assert.ok(mine.json.data.every((r) => r.responsibleUserId));
        assert.ok(mine.json.pagination.total >= 1);
    });
});

describe('relatórios e dashboard', () => {
    test('datas próximas da meia-noite respeitam o fuso America/Fortaleza', async () => {
        const f = (await createFamily(manager)).json.data;
        // 02:30 UTC de 20/12 = 23:30 de 19/12 em Fortaleza (UTC-3)
        const created = await schedule(f.id, instant('2026-12-20T02:30:00.000Z'), vol1.id);
        assert.equal(created.status, 201);
        const on19 = await manager.get('/api/v1/visits?from=2026-12-19&to=2026-12-19&familyId=' + f.id);
        const on20 = await manager.get('/api/v1/visits?from=2026-12-20&to=2026-12-20&familyId=' + f.id);
        assert.equal(on19.json.data.length, 1);
        assert.equal(on20.json.data.length, 0);
        const csv = await manager.get('/api/v1/reports/visits.csv?from=2026-12-19&to=2026-12-19');
        assert.match(csv.text, /19\/12\/2026;23:30/);
        assert.equal((await manager.get('/api/v1/visits?from=2026-12-20&to=2026-12-19')).status, 400);
        assert.equal((await manager.get('/api/v1/visits?from=2026-02-31')).status, 400);
    });

    test('indicadores batem com os registros reais e respeitam filtros e perfil', async () => {
        const f = (await createFamily(manager)).json.data;
        const v = (await schedule(f.id, new Date(Date.now() + 40 * 86400000).toISOString(), vol2.id)).json.data;
        await c2.post(`/api/v1/visits/${v.id}/record`, {
            checklistAnswers: checklist(),
            needs: [
                {
                    category: 'Moradia',
                    description: 'Telhado',
                    priority: 'alta',
                    referrals: [{ type: 'encaminhamento', responsibleUserId: vol2.id }],
                },
            ],
        });
        const summary = (await manager.get('/api/v1/reports/summary')).json.data;
        const allVisits = (await manager.get('/api/v1/visits?limit=200')).json;
        assert.equal(summary.visits.total, allVisits.pagination.total);
        const byStatus = Object.fromEntries(Object.entries(summary.visits.byStatus));
        for (const [status, total] of Object.entries(byStatus)) {
            const listed = await manager.get(`/api/v1/visits?status=${status}&limit=200`);
            assert.equal(listed.json.pagination.total, total, status);
        }
        const allNeeds = await manager.get('/api/v1/needs?limit=200');
        assert.equal(summary.needs.total, allNeeds.json.pagination.total);
        const allRefs = await manager.get('/api/v1/referrals?limit=200');
        assert.equal(summary.referrals.total, allRefs.json.pagination.total);

        const forVol2 = (await manager.get(`/api/v1/reports/summary?volunteerId=${vol2.id}`)).json.data;
        assert.equal(
            forVol2.visits.total,
            (await manager.get(`/api/v1/visits?volunteerId=${vol2.id}&limit=200`)).json.pagination.total
        );
        // voluntário não consegue ver o recorte de outro: o filtro é ignorado e fixado nele mesmo
        const spoof = (await c1.get(`/api/v1/reports/summary?volunteerId=${vol2.id}`)).json.data;
        assert.equal(spoof.filters.volunteerId, (await c1.get('/api/v1/auth/me')).json.data.user.id);
    });

    test('necessidades sem visita vinculada entram no relatório geral e no do criador', async () => {
        const f = (await createFamily(manager)).json.data;
        await schedule(f.id, new Date(Date.now() + 50 * 86400000).toISOString(), vol1.id);
        const before1 = (await c1.get('/api/v1/reports/summary')).json.data.needs.total;
        const beforeAll = (await manager.get('/api/v1/reports/summary')).json.data.needs.total;
        await c1.post('/api/v1/needs', {
            familyId: f.id,
            category: 'Documentação',
            description: 'Certidão',
            priority: 'media',
        });
        assert.equal((await c1.get('/api/v1/reports/summary')).json.data.needs.total, before1 + 1);
        assert.equal((await manager.get('/api/v1/reports/summary')).json.data.needs.total, beforeAll + 1);
    });

    test('exportação CSV: UTF-8 com BOM, filtros respeitados e proteção contra fórmulas', async () => {
        const csv = await manager.get('/api/v1/reports/visits.csv?status=concluida');
        assert.equal(csv.status, 200);
        assert.match(csv.headers.get('content-type'), /text\/csv; charset=utf-8/);
        const raw = new Uint8Array(
            await (
                await fetch(`${app.baseUrl}/api/v1/reports/visits.csv?status=concluida`, {
                    headers: { Cookie: manager.cookie },
                })
            ).arrayBuffer()
        );
        assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM UTF-8 para o Excel
        assert.ok(csv.text.startsWith('Data;Horário;Família;Responsável;Prioridade;Situação;Motivo'));
        const lines = csv.text.trim().split('\r\n');
        const concluded = (await manager.get('/api/v1/visits?status=concluida&limit=200')).json.pagination.total;
        assert.equal(lines.length - 1, concluded);
        assert.ok(lines.slice(1).every((line) => line.includes('Concluída')));

        const f = (await createFamily(manager)).json.data;
        const v = (await schedule(f.id, new Date(Date.now() + 60 * 86400000).toISOString(), vol1.id)).json.data;
        await manager.patch(`/api/v1/visits/${v.id}`, {
            status: 'cancelada',
            reason: '=HIPERLINK("http://mal.example";"x")',
        });
        const injected = await manager.get('/api/v1/reports/visits.csv?status=cancelada');
        assert.ok(injected.text.includes(`"'=HIPERLINK(""http://mal.example"";""x"")"`), injected.text);
    });

    test('dashboard por perfil', async () => {
        const manager1 = (await manager.get('/api/v1/dashboard')).json.data;
        assert.ok(manager1.visits.upcoming >= 1);
        assert.ok(Array.isArray(manager1.upcomingVisits));
        const volunteer = (await c1.get('/api/v1/dashboard')).json.data;
        assert.equal(volunteer.visits.unassigned, 0);
        assert.ok(volunteer.upcomingVisits.every((visit) => visit.volunteerName === 'Voluntaria Um'));
    });
});
