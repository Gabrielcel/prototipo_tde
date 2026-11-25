import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapManager, checklist, createFamily, createVolunteer, futureInstant, startTestApp } from './helpers.js';

let app;
let manager;
let vol1;
let vol2;
let vol1Client;
before(async () => {
    app = await startTestApp();
    manager = await bootstrapManager(app);
    vol1 = await createVolunteer(manager, 'Voluntaria Um', 'um@example.org');
    vol2 = await createVolunteer(manager, 'Voluntario Dois', 'dois@example.org');
    vol1Client = app.client();
    await vol1Client.login('um@example.org');
});
after(() => app.stop());

const newFamily = async () => (await createFamily(manager)).json.data;
const schedule = (familyId, scheduledAt, assignedTo = null, priority = 'media') =>
    manager.post('/api/v1/visits', { familyId, scheduledAt, priority, assignedTo });

describe('agendamento', () => {
    test('agenda visita atribuída (agendada) e sem responsável (sem_responsavel)', async () => {
        const family = await newFamily();
        const assigned = await schedule(family.id, futureInstant(5, 9), vol1.id);
        assert.equal(assigned.status, 201);
        assert.equal(assigned.json.data.status, 'agendada');
        const open = await schedule(family.id, futureInstant(6, 9));
        assert.equal(open.json.data.status, 'sem_responsavel');
        const agenda = await vol1Client.get('/api/v1/visits');
        assert.ok(agenda.json.data.some((v) => v.id === assigned.json.data.id));
        assert.ok(!agenda.json.data.some((v) => v.id === open.json.data.id));
    });

    test('rejeita horário passado, formato sem fuso, família inexistente e voluntário inválido', async () => {
        const family = await newFamily();
        assert.equal((await schedule(family.id, futureInstant(-1))).status, 400);
        assert.equal((await schedule(family.id, '2030-01-01T10:00:00')).status, 400);
        assert.equal((await schedule('00000000-0000-4000-8000-000000000000', futureInstant(3))).status, 404);
        const manager2 = await manager.get('/api/v1/users?role=gestor');
        assert.equal((await schedule(family.id, futureInstant(3), manager2.json.data[0].id)).status, 400);
    });

    test('impede conflito de horário da família e do voluntário (intervalo mínimo de 60 min)', async () => {
        const familyA = await newFamily();
        const familyB = await newFamily();
        assert.equal((await schedule(familyA.id, futureInstant(7, 10, 0), vol1.id)).status, 201);
        const sameFamily = await schedule(familyA.id, futureInstant(7, 10, 30), vol2.id);
        assert.equal(sameFamily.status, 409);
        assert.equal(sameFamily.json.error.code, 'SCHEDULE_CONFLICT');
        const sameVolunteer = await schedule(familyB.id, futureInstant(7, 10, 45), vol1.id);
        assert.equal(sameVolunteer.status, 409);
        assert.equal((await schedule(familyB.id, futureInstant(7, 11, 0), vol1.id)).status, 201); // exatamente 60 min: permitido
    });

    test('várias requisições simultâneas para a mesma família e horário: somente uma é gravada', async () => {
        const family = await newFamily();
        const when = futureInstant(8, 14);
        const results = await Promise.all([
            schedule(family.id, when, vol2.id),
            schedule(family.id, when, null),
            schedule(family.id, when, vol1.id),
            schedule(family.id, when, vol2.id),
        ]);
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.equal(results.filter((r) => r.status === 409).length, 3);
    });
});

describe('concorrência e integridade', () => {
    test('corrida pelo mesmo voluntário e horário grava apenas uma visita', async () => {
        const families = await Promise.all([newFamily(), newFamily(), newFamily(), newFamily()]);
        const when = futureInstant(9, 16);
        const results = await Promise.all(families.map((f) => schedule(f.id, when, vol1.id)));
        assert.equal(results.filter((r) => r.status === 201).length, 1);
        assert.equal(results.filter((r) => r.status === 409).length, 3);
        const rows = await app.query(
            `SELECT COUNT(*)::int AS n FROM visits WHERE assigned_to = $1 AND scheduled_at = $2`,
            [vol1.id, when]
        );
        assert.equal(rows.rows[0].n, 1);
    });

    test('o banco rejeita sobreposição mesmo ignorando a aplicação (restrição de exclusão)', async () => {
        const family = await newFamily();
        const when = futureInstant(20, 8);
        await schedule(family.id, when, vol2.id);
        const other = await newFamily();
        await assert.rejects(
            app.query(
                `INSERT INTO visits (family_id, assigned_to, scheduled_at, priority, status)
                 VALUES ($1, $2, $3, 'baixa', 'agendada')`,
                [other.id, vol2.id, when]
            ),
            /visits_volunteer_no_overlap/
        );
    });
});

describe('reagendar, reatribuir e cancelar', () => {
    test('reagendamento exige motivo e data futura, atualiza status e preserva histórico', async () => {
        const family = await newFamily();
        const visit = (await schedule(family.id, futureInstant(11, 9), vol1.id)).json.data;
        assert.equal(
            (await manager.patch(`/api/v1/visits/${visit.id}`, { scheduledAt: futureInstant(12, 9) })).status,
            400
        );
        assert.equal(
            (await manager.patch(`/api/v1/visits/${visit.id}`, { scheduledAt: futureInstant(-2), reason: 'x' })).status,
            400
        );
        const moved = await manager.patch(`/api/v1/visits/${visit.id}`, {
            scheduledAt: futureInstant(12, 9),
            reason: 'Família pediu outro dia',
        });
        assert.equal(moved.status, 200);
        assert.equal(moved.json.data.status, 'reagendada');
        const reassigned = await manager.patch(`/api/v1/visits/${visit.id}`, { assignedTo: vol2.id });
        assert.equal(reassigned.json.data.assignedTo, vol2.id);
        assert.equal(reassigned.json.data.status, 'reagendada');
        const released = await manager.patch(`/api/v1/visits/${visit.id}`, { assignedTo: null });
        assert.equal(released.json.data.status, 'sem_responsavel');
        const detail = (await manager.get(`/api/v1/visits/${visit.id}`)).json.data;
        assert.deepEqual(detail.history.map((h) => h.action).reverse(), [
            'criada',
            'reagendada',
            'atribuida',
            'desatribuida',
        ]);
        const rescheduleEntry = detail.history.find((h) => h.action === 'reagendada');
        assert.equal(rescheduleEntry.reason, 'Família pediu outro dia');
        assert.notEqual(rescheduleEntry.oldScheduledAt, rescheduleEntry.newScheduledAt);
    });

    test('reagendar para horário em conflito é recusado', async () => {
        const family = await newFamily();
        const a = (await schedule(family.id, futureInstant(13, 9), vol2.id)).json.data;
        const otherFamily = await newFamily();
        const b = (await schedule(otherFamily.id, futureInstant(13, 15), vol2.id)).json.data;
        const clash = await manager.patch(`/api/v1/visits/${b.id}`, {
            scheduledAt: futureInstant(13, 9, 20),
            reason: 'Teste',
        });
        assert.equal(clash.status, 409);
        assert.ok(a.id);
    });

    test('cancelamento exige motivo, não repete e não vale para visita concluída', async () => {
        const family = await newFamily();
        const visit = (await schedule(family.id, futureInstant(14, 9), vol1.id)).json.data;
        assert.equal((await manager.patch(`/api/v1/visits/${visit.id}`, { status: 'cancelada' })).status, 400);
        const cancelled = await manager.patch(`/api/v1/visits/${visit.id}`, {
            status: 'cancelada',
            reason: 'Família mudou de cidade',
        });
        assert.equal(cancelled.json.data.status, 'cancelada');
        assert.equal(
            (await manager.patch(`/api/v1/visits/${visit.id}`, { status: 'cancelada', reason: 'De novo' })).status,
            409
        );
        assert.equal(
            (await manager.patch(`/api/v1/visits/${visit.id}`, { scheduledAt: futureInstant(15), reason: 'x' })).status,
            409
        );

        const done = (await schedule(family.id, futureInstant(16, 9), vol1.id)).json.data;
        await vol1Client.post(`/api/v1/visits/${done.id}/record`, { checklistAnswers: checklist(), needs: [] });
        assert.equal(
            (await manager.patch(`/api/v1/visits/${done.id}`, { status: 'cancelada', reason: 'Tarde demais' })).status,
            409
        );
    });

    test('voluntário não agenda, reagenda nem cancela', async () => {
        const family = await newFamily();
        const visit = (await schedule(family.id, futureInstant(17, 9), vol1.id)).json.data;
        assert.equal(
            (
                await vol1Client.post('/api/v1/visits', {
                    familyId: family.id,
                    scheduledAt: futureInstant(18),
                    priority: 'baixa',
                })
            ).status,
            403
        );
        assert.equal(
            (await vol1Client.patch(`/api/v1/visits/${visit.id}`, { status: 'cancelada', reason: 'x' })).status,
            403
        );
    });
});

describe('registro da visita', () => {
    test('conclui com checklist, necessidades e múltiplos encaminhamentos na mesma transação', async () => {
        const family = await newFamily();
        const visit = (await schedule(family.id, futureInstant(21, 9), vol1.id)).json.data;
        const result = await vol1Client.post(`/api/v1/visits/${visit.id}/record`, {
            checklistAnswers: checklist(),
            conditions: 'Casa organizada',
            observations: 'Família receptiva',
            needs: [
                {
                    category: 'Alimentação',
                    description: 'Cesta básica mensal',
                    priority: 'alta',
                    referrals: [
                        { type: 'encaminhamento', responsibleUserId: vol1.id, description: 'CRAS' },
                        { type: 'pendencia', responsibleUserId: vol2.id },
                    ],
                },
            ],
        });
        assert.equal(result.status, 201, result.text);
        assert.equal(result.json.data.needs[0].referralIds.length, 2);

        const detail = (await vol1Client.get(`/api/v1/visits/${visit.id}`)).json.data;
        assert.equal(detail.status, 'concluida');
        assert.equal(detail.record.checklist.length, 6);
        assert.equal(detail.needs.length, 1);
        const needs = (await manager.get(`/api/v1/needs?familyId=${family.id}`)).json.data;
        assert.equal(needs[0].referrals.length, 2);
        assert.ok(needs[0].referrals.every((r) => r.id));
    });

    test('impede registro duplicado, checklist incompleto e dados inválidos', async () => {
        const family = await newFamily();
        const visit = (await schedule(family.id, futureInstant(22, 9), vol1.id)).json.data;
        const record = (body) => vol1Client.post(`/api/v1/visits/${visit.id}/record`, body);
        assert.equal((await record({ checklistAnswers: checklist().slice(0, 5) })).status, 400);
        assert.equal((await record({ checklistAnswers: checklist('Talvez') })).status, 400);
        assert.equal(
            (
                await record({
                    checklistAnswers: [...checklist().slice(0, 5), { item: 'Item inventado', answer: 'Sim' }],
                })
            ).status,
            400
        );
        assert.equal(
            (
                await record({
                    checklistAnswers: checklist(),
                    needs: [{ category: 'Inexistente', description: 'x', priority: 'alta' }],
                })
            ).status,
            400
        );
        assert.equal(
            (
                await record({
                    checklistAnswers: checklist(),
                    needs: [
                        {
                            category: 'Saúde',
                            description: 'ok',
                            priority: 'alta',
                            referrals: [
                                { type: 'encaminhamento', responsibleUserId: '00000000-0000-4000-8000-000000000000' },
                            ],
                        },
                    ],
                })
            ).status,
            400
        );
        // nada foi gravado pelas tentativas inválidas
        assert.equal(
            (await app.query(`SELECT COUNT(*)::int AS n FROM visit_records WHERE visit_id = $1`, [visit.id])).rows[0].n,
            0
        );
        assert.equal(
            (await app.query(`SELECT COUNT(*)::int AS n FROM needs WHERE visit_id = $1`, [visit.id])).rows[0].n,
            0
        );
        assert.equal((await record({ checklistAnswers: checklist() })).status, 201);
        const again = await record({ checklistAnswers: checklist() });
        assert.equal(again.status, 409);
        const [a, b] = await Promise.all([
            record({ checklistAnswers: checklist() }),
            record({ checklistAnswers: checklist() }),
        ]);
        assert.deepEqual([a.status, b.status], [409, 409]);
    });

    test('falha no meio do registro desfaz tudo (rollback)', async () => {
        const family = await newFamily();
        const visit = (await schedule(family.id, futureInstant(23, 9), vol1.id)).json.data;
        await app.query(
            `CREATE OR REPLACE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END $$`
        );
        await app.query(
            `CREATE TRIGGER boom_on_referral BEFORE INSERT ON referrals FOR EACH ROW EXECUTE FUNCTION boom()`
        );
        const result = await vol1Client.post(`/api/v1/visits/${visit.id}/record`, {
            checklistAnswers: checklist(),
            needs: [
                {
                    category: 'Saúde',
                    description: 'Consulta',
                    priority: 'media',
                    referrals: [{ type: 'encaminhamento', responsibleUserId: vol1.id }],
                },
            ],
        });
        await app.query(`DROP TRIGGER boom_on_referral ON referrals`);
        assert.equal(result.status, 500);
        assert.equal(
            (await app.query(`SELECT status FROM visits WHERE id = $1`, [visit.id])).rows[0].status,
            'agendada'
        );
        assert.equal(
            (await app.query(`SELECT COUNT(*)::int AS n FROM visit_records WHERE visit_id = $1`, [visit.id])).rows[0].n,
            0
        );
        assert.equal(
            (await app.query(`SELECT COUNT(*)::int AS n FROM needs WHERE visit_id = $1`, [visit.id])).rows[0].n,
            0
        );
        assert.equal(
            (await vol1Client.post(`/api/v1/visits/${visit.id}/record`, { checklistAnswers: checklist() })).status,
            201
        );
    });

    test('voluntário não registra visita de outro voluntário nem visita sem responsável', async () => {
        const family = await newFamily();
        const others = (await schedule(family.id, futureInstant(24, 9), vol2.id)).json.data;
        assert.equal(
            (await vol1Client.post(`/api/v1/visits/${others.id}/record`, { checklistAnswers: checklist() })).status,
            404
        );
        assert.equal((await vol1Client.get(`/api/v1/visits/${others.id}`)).status, 404);
        const open = (await schedule(family.id, futureInstant(25, 9))).json.data;
        const byManager = await manager.post(`/api/v1/visits/${open.id}/record`, { checklistAnswers: checklist() });
        assert.equal(byManager.status, 409);
        assert.equal(byManager.json.error.code, 'NO_VOLUNTEER');
    });
});
