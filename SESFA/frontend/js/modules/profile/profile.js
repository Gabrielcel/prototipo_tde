import { api } from '../../services/api.js';
import { getState, setSession } from '../../core/state.js';
import { html } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { pageHeader, requiredNote } from '../../components/ui.js';
import {
    clearFormErrors,
    focusFirstInvalid,
    formErrorRegion,
    handleSubmit,
    inputField,
    readForm,
    setFieldError,
} from '../../components/forms.js';
import { registerForms } from '../../core/actions.js';
import { toastSuccess } from '../../components/notification.js';
import { label } from '../../utils/formatters.js';
import { isPersonName } from '../../utils/validators.js';

export async function renderProfile() {
    const { user } = getState();
    return html`${pageHeader({ title: 'Meu perfil', subtitle: 'Dados da sua conta e segurança do acesso.' })}
        <div class="split-even">
            <section class="card">
                <div class="card-header"><h2>Dados pessoais</h2></div>
                <form class="card-body stack-sm" data-form="profile-update" novalidate>
                    ${formErrorRegion()}${requiredNote()}
                    ${inputField({ name: 'fullName', label: 'Nome completo', required: true, value: user.fullName, maxlength: 120, autocomplete: 'name' })}
                    <div class="field">
                        <span class="label">E-mail de acesso</span><span>${user.email}</span
                        ><span class="hint">Para alterar o e-mail, peça a um gestor.</span>
                    </div>
                    <div class="field"><span class="label">Perfil</span><span>${label('role', user.role)}</span></div>
                    <div><button type="submit" class="btn btn-primary">Salvar nome</button></div>
                </form>
            </section>
            <section class="card">
                <div class="card-header"><h2>Alterar senha</h2></div>
                <form class="card-body stack-sm" data-form="password-update" novalidate>
                    ${formErrorRegion()}
                    <p class="text-muted">
                        Ao trocar a senha, os demais dispositivos conectados à sua conta são desconectados.
                    </p>
                    ${inputField({ name: 'currentPassword', label: 'Senha atual', type: 'password', required: true, autocomplete: 'current-password', maxlength: 1024 })}
                    ${inputField({ name: 'newPassword', label: 'Nova senha', type: 'password', required: true, autocomplete: 'new-password', maxlength: 1024, hint: 'Mínimo de 8 caracteres.' })}
                    ${inputField({ name: 'confirm', label: 'Repita a nova senha', type: 'password', required: true, autocomplete: 'new-password', maxlength: 1024 })}
                    <div><button type="submit" class="btn btn-primary">${icon('lock')}Alterar senha</button></div>
                </form>
            </section>
        </div>
        <p class="actions">
            <button type="button" class="btn" data-action="logout">${icon('log-out')}Sair do sistema</button>
        </p>`;
}

registerForms({
    'profile-update'(form) {
        return handleSubmit(form, async () => {
            const { fullName } = readForm(form);
            if (!isPersonName(fullName)) {
                setFieldError(form, 'fullName', 'Informe o nome completo (apenas letras).');
                return focusFirstInvalid(form);
            }
            const { data } = await api.patch('/auth/me', { fullName });
            setSession({ user: data.user, csrfToken: getState().csrfToken });
            document.querySelectorAll('.side-user-name').forEach((element) => {
                element.textContent = data.user.fullName;
            });
            return toastSuccess('Nome atualizado.');
        });
    },
    'password-update'(form) {
        return handleSubmit(form, async () => {
            const v = readForm(form);
            if (!v.currentPassword) setFieldError(form, 'currentPassword', 'Informe a senha atual.');
            if (v.newPassword.length < 8) setFieldError(form, 'newPassword', 'Use ao menos 8 caracteres.');
            if (v.confirm !== v.newPassword) setFieldError(form, 'confirm', 'As senhas não coincidem.');
            if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
            await api.patch('/auth/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
            form.reset();
            clearFormErrors(form);
            return toastSuccess('Senha alterada. Os outros dispositivos foram desconectados.');
        });
    },
});
