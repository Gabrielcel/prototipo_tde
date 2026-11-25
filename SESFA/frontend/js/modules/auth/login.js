import { html, setHtml } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import {
    formErrorRegion,
    inputField,
    readForm,
    setFieldError,
    clearFormErrors,
    showFormError,
    focusFirstInvalid,
} from '../../components/forms.js';
import { withLoading } from '../../components/buttons.js';
import { registerActions, registerForms } from '../../core/actions.js';
import { requiredNote } from '../../components/ui.js';
import { login, bootstrap } from '../../services/auth.js';
import { isEmail } from '../../utils/validators.js';
import { setInitialized } from '../../core/state.js';

function brandPanel() {
    return html`<section class="login-brand" aria-label="Apresentação do sistema">
        <a class="brand" href="/">
            <img src="/assets/images/logo/logo-symbol-light.svg" alt="" width="48" height="48" />
            <span class="brand-name">SESFA<span class="brand-sub">Sistema de Acompanhamento Familiar</span></span>
        </a>
        <div>
            <h1>Cuidado organizado, acompanhamento que faz diferença.</h1>
            <p>
                Cadastro de famílias, agenda de visitas e acompanhamento das necessidades em um só lugar, com segurança
                e respeito aos dados de cada pessoa.
            </p>
        </div>
        <figure class="login-figure">
            <img
                src="/assets/images/login/conversa-acompanhamento.webp"
                width="1400"
                height="788"
                alt="Voluntária conversando com uma família durante uma visita de acompanhamento."
            />
        </figure>
    </section>`;
}

const security = () =>
    html`<p class="login-security">
        ${icon('shield-check')}<span
            >Os dados das famílias são confidenciais. Use somente a sua conta e encerre a sessão ao terminar.</span
        >
    </p>`;

export function renderLogin({ setup = false, notice = '' } = {}) {
    const form = setup
        ? html`<form class="login-form" data-form="bootstrap" novalidate>
              <div class="login-mobile-brand">
                  <img src="/assets/images/logo/logo-symbol.svg" alt="" /><strong>SESFA</strong>
              </div>
              <div>
                  <span class="eyebrow">Configuração inicial</span>
                  <h2>Crie a conta do gestor</h2>
              </div>
              <p class="text-muted">
                  Este é o primeiro acesso ao sistema. A conta criada aqui terá perfil de gestor e poderá cadastrar os
                  demais usuários.
              </p>
              ${formErrorRegion()} ${requiredNote()}
              ${inputField({ name: 'fullName', label: 'Nome completo', required: true, autocomplete: 'name' })}
              ${inputField({ name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'username', maxlength: 254 })}
              ${passwordField({ name: 'password', label: 'Senha', hint: 'Mínimo de 8 caracteres.', autocomplete: 'new-password' })}
              ${passwordField({ name: 'confirm', label: 'Repita a senha', autocomplete: 'new-password' })}
              <button type="submit" class="btn btn-primary btn-block">Criar conta e entrar</button>
              ${security()}
          </form>`
        : html`<form class="login-form" data-form="login" novalidate>
              <div class="login-mobile-brand">
                  <img src="/assets/images/logo/logo-symbol.svg" alt="" /><strong>SESFA</strong>
              </div>
              <div>
                  <h2>Acessar o sistema</h2>
                  <p class="text-muted">Informe seu e-mail e sua senha.</p>
              </div>
              ${
                  notice
                      ? html`<div class="alert alert-info" role="status">
                            ${icon('info')}
                            <div class="alert-body">${notice}</div>
                        </div>`
                      : ''
              }
              ${formErrorRegion()} ${requiredNote()}
              ${inputField({ name: 'email', label: 'E-mail', type: 'email', required: true, autocomplete: 'username', maxlength: 254 })}
              ${passwordField({ name: 'password', label: 'Senha', autocomplete: 'current-password' })}
              <button type="submit" class="btn btn-primary btn-block">Entrar</button>
              ${security()}
          </form>`;
    return html`<div class="login-page">
        ${brandPanel()}
        <main class="login-panel" id="conteudo" tabindex="-1">${form}</main>
    </div>`;
}

function passwordField({ name, label, hint = '', autocomplete }) {
    const id = `f-${name}`;
    return html`<div class="field">
        <label for="${id}">${label}<span class="required-mark" aria-hidden="true">*</span></label>
        <div class="input-group">
            <input
                class="input"
                id="${id}"
                name="${name}"
                type="password"
                required
                aria-required="true"
                maxlength="1024"
                autocomplete="${autocomplete}"
                aria-describedby="${hint ? `${id}-hint ` : ''}${id}-error"
            />
            <button
                type="button"
                class="toggle"
                data-action="toggle-password"
                data-target="${id}"
                aria-label="Mostrar senha"
                aria-pressed="false"
            >
                ${icon('eye')}
            </button>
        </div>
        ${hint ? html`<span class="hint" id="${id}-hint">${hint}</span>` : ''}
        <span class="field-error" id="${id}-error" aria-live="polite"></span>
    </div>`;
}

function authenticated() {
    document.dispatchEvent(new CustomEvent('sesfa:authenticated'));
}

registerActions({
    'toggle-password'(button) {
        const input = document.getElementById(button.dataset.target);
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
        setHtml(button, icon(visible ? 'eye-off' : 'eye'));
    },
});

registerForms({
    async login(form) {
        clearFormErrors(form);
        const { email, password } = readForm(form);
        if (!email) setFieldError(form, 'email', 'Informe o e-mail.');
        else if (!isEmail(email)) setFieldError(form, 'email', 'Informe um e-mail válido.');
        if (!password) setFieldError(form, 'password', 'Informe a senha.');
        if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
        await withLoading(form.querySelector('[type="submit"]'), async () => {
            try {
                await login(email, password);
                authenticated();
            } catch (error) {
                form.elements.password.value = ''; // o e-mail digitado é mantido
                showFormError(form, error.message);
            }
        });
    },

    async bootstrap(form) {
        clearFormErrors(form);
        const { fullName, email, password, confirm } = readForm(form);
        if (!fullName || fullName.length < 2) setFieldError(form, 'fullName', 'Informe o nome completo.');
        if (!isEmail(email)) setFieldError(form, 'email', 'Informe um e-mail válido.');
        if (password.length < 8) setFieldError(form, 'password', 'Use ao menos 8 caracteres.');
        if (confirm !== password) setFieldError(form, 'confirm', 'As senhas não coincidem.');
        if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
        await withLoading(form.querySelector('[type="submit"]'), async () => {
            try {
                await bootstrap({ fullName, email, password });
                setInitialized(true);
                authenticated();
            } catch (error) {
                form.elements.password.value = '';
                form.elements.confirm.value = '';
                showFormError(form, error.message);
            }
        });
    },
});
