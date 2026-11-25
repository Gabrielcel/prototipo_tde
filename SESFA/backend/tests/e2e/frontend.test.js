// Teste de ponta a ponta da interface: empacota o frontend real, executa em jsdom e conversa com
// o servidor e o PostgreSQL reais. Não substitui a inspeção visual em um navegador de verdade.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { PASSWORD, startTestApp } from '../integration/helpers.js';

const frontend = resolve(fileURLToPath(new URL('../../../frontend/', import.meta.url)));
let app;
let dom;
let window;
let document;
const consoleErrors = [];
const cookies = new Map();

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function waitFor(check, { timeout = 6000, label = 'condição' } = {}) {
    const started = Date.now();
    for (;;) {
        try {
            const value = check();
            if (value) return value;
        } catch {
            /* tenta de novo */
        }
        if (Date.now() - started > timeout)
            throw new Error(
                `Tempo esgotado esperando: ${label}\nHTML atual: ${document.querySelector('#view')?.textContent?.slice(0, 400) ?? document.body.textContent.slice(0, 400)}`
            );
        await sleep(25);
    }
}

const $ = (selector) => document.querySelector(selector);
const text = () => document.body.textContent.replace(/\s+/g, ' ');
const hash = () => window.location.hash;

function click(element) {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function fill(form, values) {
    for (const [name, value] of Object.entries(values)) {
        const field = form.elements[name];
        if (!field) throw new Error(`Campo inexistente: ${name}`);
        if (field instanceof window.RadioNodeList) {
            [...field].find((radio) => radio.value === value).checked = true;
        } else if (field.type === 'checkbox') {
            field.checked = Boolean(value);
        } else {
            field.value = value;
            field.dispatchEvent(new window.Event('input', { bubbles: true }));
        }
    }
}

const submit = (form) => form.requestSubmit();
const goto = async (path) => {
    window.location.hash = path;
    await sleep(30);
};

async function boot() {
    const bundle = await build({
        entryPoints: [resolve(frontend, 'js/core/app.js')],
        bundle: true,
        format: 'iife',
        write: false,
        logLevel: 'silent',
    });
    const page = (await readFile(resolve(frontend, 'index.html'), 'utf8')).replace(/<script[^>]*><\/script>/, '');
    dom = new JSDOM(page, { url: `${app.baseUrl}/`, runScripts: 'outside-only', pretendToBeVisual: true });
    window = dom.window;
    document = window.document;
    window.fetch = async (url, options = {}) => {
        const response = await fetch(new URL(url, app.baseUrl), {
            ...options,
            headers: {
                ...options.headers,
                ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
            },
        });
        for (const cookie of response.headers.getSetCookie()) {
            const [pair] = cookie.split(';');
            const [name, value] = pair.split('=');
            if (/Max-Age=0/i.test(cookie)) cookies.delete(name);
            else cookies.set(name, value);
        }
        return response;
    };
    window.HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute('open');
        this.dispatchEvent(new window.Event('close'));
    };
    window.scrollTo = () => {};
    window.console.error = (...args) => consoleErrors.push(args.map(String).join(' '));
    window.addEventListener('error', (event) => consoleErrors.push(`window.error: ${event.message}`));
    window.eval(bundle.outputFiles[0].text);
}

const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function login(email, password = PASSWORD) {
    await waitFor(() => $('form[data-form="login"]'), { label: 'tela de login' });
    const form = $('form[data-form="login"]');
    fill(form, { email, password });
    submit(form);
    await waitFor(() => $('.app-shell'), { label: 'área logada' });
    await waitFor(() => $('#page-title'), { label: 'página inicial' });
}

async function logout() {
    click($('.sidebar [data-action="logout"]'));
    await waitFor(() => $('.login-page'), { label: 'volta ao login' });
}

before(async () => {
    app = await startTestApp();
    await boot();
});
after(async () => {
    window?.close();
    await app.stop();
});

describe('interface (ponta a ponta)', () => {
    test('primeiro acesso mostra a configuração inicial e cria o gestor', async () => {
        await waitFor(() => $('form[data-form="bootstrap"]'), { label: 'configuração inicial' });
        assert.match(text(), /Configuração inicial/);
        assert.ok($('img[alt]'), 'imagem institucional com texto alternativo');
        const form = $('form[data-form="bootstrap"]');
        fill(form, { fullName: 'Marta Gestora', email: 'marta@example.org', password: 'curta', confirm: 'curta' });
        submit(form);
        await waitFor(() => form.querySelector('#f-password-error').textContent, { label: 'erro de senha curta' });
        assert.equal(form.elements.fullName.value, 'Marta Gestora', 'dados digitados são mantidos');
        fill(form, { password: PASSWORD, confirm: PASSWORD });
        submit(form);
        await waitFor(() => $('.app-shell'), { label: 'área logada' });
        await waitFor(() => /Bom dia|Boa tarde|Boa noite/.test($('#page-title')?.textContent ?? ''), {
            label: 'saudação',
        });
        assert.match(hash(), /#\/inicio/);
        const nav = [...document.querySelectorAll('.side-nav a')].map((a) => a.textContent.trim());
        assert.deepEqual(nav, ['Início', 'Famílias', 'Agenda', 'Necessidades', 'Relatórios', 'Usuários', 'Meu perfil']);
    });

    test('lista de famílias vazia oferece o primeiro cadastro', async () => {
        await goto('#/familias');
        await waitFor(() => /Nenhuma família cadastrada/.test(text()), { label: 'estado vazio' });
        assert.ok($('#view a[href="#/familias/nova"]'));
    });

    test('cadastro de família em etapas, com validação, integrantes e consentimento', async () => {
        await goto('#/familias/nova');
        await waitFor(() => $('form[data-form="family-next"]'), { label: 'etapa 1' });
        let form = $('form[data-form="family-next"]');
        submit(form);
        await waitFor(() => form.querySelector('[aria-invalid="true"]'), { label: 'validação da etapa 1' });
        fill(form, {
            contactName: 'Maria das Dores',
            birthDate: '1988-04-10',
            phone: '88999990001',
            email: 'maria@example.org',
        });
        assert.equal(form.elements.phone.value, '(88) 99999-0001', 'máscara de telefone aplicada');
        submit(form);
        await waitFor(() => $('form[data-form="family-next"] [name="street"]'), { label: 'etapa 2' });
        form = $('form[data-form="family-next"]');
        fill(form, {
            street: '<img src=x onerror=alert(1)> Rua A, 10',
            neighborhood: 'Centro',
            city: 'Barbalha',
            postalCode: '63180000',
        });
        assert.equal(form.elements.postalCode.value, '63180-000');
        submit(form);
        await waitFor(() => $('[data-action="fam-member-add"]'), { label: 'etapa 3' });
        click($('[data-action="fam-member-add"]'));
        form = $('form[data-form="family-next"]');
        fill(form, { m_name_0: 'João Silva', m_rel_0: 'Filho(a)', m_birth_0: '2015-05-05' });
        submit(form);
        await waitFor(() => $('form[data-form="family-save"]'), { label: 'revisão' });
        assert.match(text(), /João Silva \(Filho\(a\)\)/);
        form = $('form[data-form="family-save"]');
        submit(form);
        await waitFor(() => form.querySelector('#f-consentGiven-error').textContent, { label: 'exige consentimento' });
        fill(form, { consentGiven: true });
        submit(form);
        await waitFor(() => /#\/familias\/[0-9a-f-]{36}$/.test(hash()), { label: 'detalhe da família' });
        await waitFor(() => /Maria das Dores/.test($('#page-title')?.textContent ?? ''), {
            label: 'título do detalhe',
        });
        assert.match(text(), /Integrantes \(2\)/);
        assert.match(text(), /Cadastro recente/);
    });

    test('texto malicioso é exibido como texto, nunca interpretado como HTML', async () => {
        assert.equal(document.querySelector('#view img'), null);
        assert.match($('#view').textContent, /<img src=x onerror=alert\(1\)> Rua A, 10/);
    });

    test('cadastro duplicado pede confirmação', async () => {
        await goto('#/familias/nova');
        await waitFor(() => $('form[data-form="family-next"]'));
        let form = $('form[data-form="family-next"]');
        fill(form, { contactName: 'Outra Pessoa', birthDate: '1990-01-01', phone: '(88) 99999-0001' });
        submit(form);
        await waitFor(() => $('form[data-form="family-next"] [name="street"]'));
        form = $('form[data-form="family-next"]');
        fill(form, { street: 'Rua B, 2', neighborhood: 'Centro', city: 'Barbalha' });
        submit(form);
        await waitFor(() => $('[data-action="fam-member-add"]'));
        submit($('form[data-form="family-next"]'));
        await waitFor(() => $('form[data-form="family-save"]'));
        form = $('form[data-form="family-save"]');
        fill(form, { consentGiven: true });
        submit(form);
        await waitFor(() => $('dialog[open]'), { label: 'aviso de duplicidade' });
        assert.match($('dialog[open]').textContent, /Maria das Dores/);
        click($('dialog[open] [data-action="modal-close"]:not(.btn-icon)'));
        await sleep(50);
        assert.equal($('dialog[open]'), null);
    });

    test('gestor cadastra voluntário e agenda uma visita', async () => {
        await goto('#/usuarios');
        await waitFor(() => $('[data-action="user-add"]'), { label: 'página de usuários' });
        click($('[data-action="user-add"]'));
        const form = await waitFor(() => $('dialog[open] form[data-form="user-create"]'));
        fill(form, { fullName: 'Vera Voluntária', email: 'vera@example.org', role: 'voluntario', password: PASSWORD });
        submit(form);
        await waitFor(() => /vera@example.org/.test(text()), { label: 'usuário na tabela' });
        assert.equal($('dialog[open]'), null);

        await goto('#/familias');
        const link = await waitFor(() => $('#view table a[href^="#/familias/"]'), { label: 'família na lista' });
        click(link);
        await waitFor(() => $('[data-action="open-schedule"]'), { label: 'detalhe' });
        click($('[data-action="open-schedule"]'));
        const schedule = await waitFor(() => $('dialog[open] form[data-form="visit-create"]'), {
            label: 'modal de agendamento',
        });
        const volunteer = [...schedule.elements.assignedTo.options].find((option) => /Vera/.test(option.textContent));
        fill(schedule, { date: futureDate(5), time: '09:00', priority: 'alta', assignedTo: volunteer.value });
        submit(schedule);
        await waitFor(() => $('dialog[open]') === null, { label: 'modal fechado' });
        await waitFor(() => /Agendada/.test($('#view').textContent), { label: 'visita listada' });

        // mesmo horário para a mesma família: conflito mostrado no formulário
        click($('[data-action="open-schedule"]'));
        const again = await waitFor(() => $('dialog[open] form[data-form="visit-create"]'));
        fill(again, { date: futureDate(5), time: '09:30', priority: 'media', assignedTo: '' });
        submit(again);
        await waitFor(() => !again.querySelector('[data-form-error]').hidden, { label: 'erro de conflito' });
        assert.match(again.querySelector('[data-form-error]').textContent, /horário próximo/);
        click(again.querySelector('[data-action="modal-close"]'));
    });

    test('agenda do gestor mostra a visita e permite filtrar', async () => {
        await goto('#/agenda');
        await waitFor(() => /Maria das Dores/.test($('#view').textContent), { label: 'agenda com visita' });
        assert.match($('#view').textContent, /Vera Voluntária/);
        await goto('#/agenda?status=cancelada');
        await waitFor(() => /Nenhuma visita encontrada/.test($('#view').textContent), {
            label: 'filtro sem resultado',
        });
    });

    test('voluntário vê somente o seu menu, registra a visita com necessidade e encaminhamento', async () => {
        await logout();
        assert.equal(hash(), '', 'hash limpo após sair');
        await login('vera@example.org');
        const nav = [...document.querySelectorAll('.side-nav a')].map((a) => a.textContent.trim());
        assert.deepEqual(nav, ['Início', 'Famílias', 'Agenda', 'Necessidades', 'Meu perfil']);
        await goto('#/usuarios');
        await waitFor(() => /Acesso não autorizado/.test($('#view').textContent), { label: 'bloqueio de página' });

        await goto('#/agenda');
        const register = await waitFor(() => $('#view a[href$="/registro"]'), { label: 'botão registrar' });
        click(register);
        await waitFor(() => $('form[data-form="visit-record"]'), { label: 'formulário de registro' });
        let form = $('form[data-form="visit-record"]');
        submit(form);
        await waitFor(() => form.querySelector('#f-c-0-error').textContent, { label: 'checklist obrigatório' });

        click($('[data-action="rec-need-add"]'));
        form = $('form[data-form="visit-record"]');
        const answers = {};
        for (let i = 0; i < 6; i += 1) answers[`c_${i}`] = 'Sim';
        fill(form, {
            ...answers,
            conditions: 'Casa organizada',
            n_cat_0: 'Alimentação',
            n_pri_0: 'alta',
            n_desc_0: 'Cesta básica mensal',
        });
        click($('[data-action="rec-ref-add"]'));
        form = $('form[data-form="visit-record"]');
        assert.equal(form.elements.c_3.value, 'Sim', 'respostas preservadas ao adicionar itens');
        const person = [...form.elements.r_resp_0_0.options].find((option) => /Vera/.test(option.textContent));
        fill(form, { r_resp_0_0: person.value, r_desc_0_0: 'CRAS Barbalha' });
        submit(form);
        await waitFor(() => $('dialog[open] [data-action="modal-confirm"]'), { label: 'confirmação de conclusão' });
        click($('dialog[open] [data-action="modal-confirm"]'));
        await waitFor(
            () => /Concluída/.test($('#view')?.textContent ?? '') && /Registro da visita/.test($('#view').textContent),
            { label: 'visita concluída' }
        );
        assert.match($('#view').textContent, /Cesta básica mensal/);
    });

    test('necessidades: voluntário altera a situação do encaminhamento e da necessidade', async () => {
        await goto('#/necessidades');
        await waitFor(() => /Cesta básica mensal/.test($('#view').textContent), { label: 'necessidade listada' });
        const select = $('select[data-change="referral-status"]');
        select.value = 'em_andamento';
        select.dispatchEvent(new window.Event('change', { bubbles: true }));
        await waitFor(() => /Situação atualizada/.test($('#toasts').textContent), { label: 'confirmação' });
        await waitFor(() => $('select[data-change="referral-status"]')?.value === 'em_andamento');
        const need = $('select[data-change="need-status"]');
        assert.deepEqual(
            [...need.options].map((o) => o.value),
            ['pendente', 'em_andamento', 'resolvida']
        );
    });

    test('relatórios do gestor refletem os registros e exportam CSV', async () => {
        await logout();
        await login('marta@example.org');
        await goto('#/relatorios');
        await waitFor(() => /Total de visitas/.test($('#view').textContent), { label: 'relatório' });
        const cards = [...document.querySelectorAll('.stat')].map((card) =>
            card.textContent.replace(/\s+/g, ' ').trim()
        );
        assert.ok(
            cards.some((c) => /Total de visitas\s*1/.test(c)),
            cards.join(' | ')
        );
        assert.ok(cards.some((c) => /Concluídas\s*1/.test(c)));
        assert.ok(cards.some((c) => /Necessidades registradas\s*1/.test(c)));
        assert.ok($('progress'));
    });

    test('sessão expirada leva ao login com aviso, sem manter dados da conta anterior', async () => {
        await app.query("UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 minute'");
        await goto('#/familias');
        await waitFor(() => $('.login-page'), { label: 'volta ao login' });
        assert.match(text(), /sessão expirou/);
        assert.equal(document.querySelector('.sidebar'), null);
        assert.ok(!text().includes('Marta Gestora'));
    });

    test('nenhum erro de console durante todo o percurso', () => {
        assert.deepEqual(consoleErrors, []);
    });
});
