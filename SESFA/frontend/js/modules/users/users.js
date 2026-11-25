import { api } from '../../services/api.js';
import { getState } from '../../core/state.js';
import { html } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { badge, emptyState, pageHeader, pagination, requiredNote } from '../../components/ui.js';
import { closeModal, confirmDialog, openModal } from '../../components/modal.js';
import {
    focusFirstInvalid,
    handleSubmit,
    inputField,
    modalForm,
    readForm,
    selectField,
    setFieldError,
} from '../../components/forms.js';
import { registerActions, registerChanges, registerForms, registerInputs } from '../../core/actions.js';
import { navigate, refreshRoute } from '../../core/router.js';
import { toast, toastSuccess } from '../../components/notification.js';
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../../core/config.js';
import { debounce } from '../../utils/helpers.js';
import { LABELS, formatDateTime } from '../../utils/formatters.js';
import { isEmail, isPersonName } from '../../utils/validators.js';

const opts = (map) => Object.entries(map).map(([value, text]) => ({ value, label: text }));

export async function renderUsers({ query }) {
    const page = Number(query.page) || 1;
    const params = { search: query.search ?? '', role: query.role ?? '', status: query.status ?? '' };
    const { data, pagination: info } = await api.get('/users', { ...params, page, limit: PAGE_SIZE });
    const me = getState().user;
    const filtered = Object.values(params).some(Boolean);

    return html`${pageHeader({
            title: 'Usuários',
            subtitle: 'Gerencie quem acessa o sistema e com qual perfil.',
            actions: html`<button type="button" class="btn btn-primary" data-action="user-add">
                ${icon('user-plus')}Novo usuário
            </button>`,
        })}
        <section class="card">
            <form class="filters" role="search" data-form="user-filters" aria-label="Filtrar usuários">
                <div class="field field-grow">
                    <label for="f-search">Buscar</label>
                    <div class="input-search">
                        ${icon('search')}<input
                            class="input"
                            id="f-search"
                            name="search"
                            type="search"
                            value="${params.search}"
                            maxlength="100"
                            placeholder="Nome ou e-mail"
                            data-input="user-search"
                            autocomplete="off"
                        />
                    </div>
                </div>
                ${selectField({ name: 'role', label: 'Perfil', value: params.role, emptyLabel: 'Todos', options: opts(LABELS.role), change: 'user-filter-change' })}
                ${selectField({ name: 'status', label: 'Situação', value: params.status, emptyLabel: 'Todas', options: opts(LABELS.userStatus), change: 'user-filter-change' })}
            </form>
            ${
                data.length
                    ? html`<div class="table-wrap">
                              <table class="data">
                                  <caption class="sr-only">
                                      Usuários
                                  </caption>
                                  <thead>
                                      <tr>
                                          <th scope="col">Nome</th>
                                          <th scope="col">E-mail</th>
                                          <th scope="col">Perfil</th>
                                          <th scope="col">Situação</th>
                                          <th scope="col">Último acesso</th>
                                          <th scope="col"><span class="sr-only">Ações</span></th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${data.map(
                                          (user) =>
                                              html`<tr>
                                                  <td data-l="Nome" class="cell-main">
                                                      ${user.fullName}${user.id === me.id ? html` <span class="text-muted text-small">(você)</span>` : ''}
                                                  </td>
                                                  <td data-l="E-mail">${user.email}</td>
                                                  <td data-l="Perfil">${LABELS.role[user.role]}</td>
                                                  <td data-l="Situação">${badge('userStatus', user.status)}</td>
                                                  <td data-l="Último acesso">
                                                      ${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca acessou'}
                                                  </td>
                                                  <td class="cell-actions">
                                                      <button
                                                          type="button"
                                                          class="btn btn-sm"
                                                          data-action="user-edit"
                                                          data-id="${user.id}"
                                                          data-name="${user.fullName}"
                                                          data-role="${user.role}"
                                                          ${user.id === me.id ? 'disabled' : ''}
                                                          aria-label="Editar ${user.fullName}"
                                                      >
                                                          ${icon('pencil')}Editar
                                                      </button>
                                                      ${
                                                          user.id === me.id
                                                              ? ''
                                                              : user.status === 'ativo'
                                                                ? html`<button
                                                                      type="button"
                                                                      class="btn btn-sm btn-danger"
                                                                      data-action="user-deactivate"
                                                                      data-id="${user.id}"
                                                                      data-name="${user.fullName}"
                                                                  >
                                                                      Desativar
                                                                  </button>`
                                                                : html`<button
                                                                      type="button"
                                                                      class="btn btn-sm"
                                                                      data-action="user-activate"
                                                                      data-id="${user.id}"
                                                                      data-name="${user.fullName}"
                                                                  >
                                                                      Reativar
                                                                  </button>`
                                                      }
                                                  </td>
                                              </tr>`
                                      )}
                                  </tbody>
                              </table>
                          </div>
                          ${pagination(info, '/usuarios', params)}`
                    : emptyState({
                          iconName: 'users',
                          title: filtered ? 'Nenhum usuário encontrado' : 'Nenhum usuário',
                          text: filtered
                              ? 'Nenhum registro corresponde aos filtros utilizados.'
                              : 'Cadastre o primeiro usuário.',
                      })
            }
        </section>`;
}

const goFilters = (form) => {
    const data = new FormData(form);
    navigate(
        '/usuarios',
        { search: data.get('search'), role: data.get('role'), status: data.get('status') },
        { replace: true, silent: true }
    );
};
const applySearch = debounce((input) => goFilters(input.form), SEARCH_DEBOUNCE_MS);
registerInputs({ 'user-search': (input) => applySearch(input) });
registerChanges({ 'user-filter-change': (element) => goFilters(element.form) });
registerForms({ 'user-filters': (form) => goFilters(form) });

registerActions({
    'user-add'() {
        openModal({
            title: 'Novo usuário',
            body: modalForm({
                name: 'user-create',
                submitLabel: 'Cadastrar usuário',
                body: html`${requiredNote()}${inputField({ name: 'fullName', label: 'Nome completo', required: true, maxlength: 120, autocomplete: 'off' })}
                ${inputField({ name: 'email', label: 'E-mail', type: 'email', required: true, maxlength: 254, autocomplete: 'off' })}
                ${selectField({ name: 'role', label: 'Perfil', value: 'voluntario', emptyLabel: null, options: opts(LABELS.role), hint: 'Gestores gerenciam usuários, famílias e agenda. Voluntários registram as próprias visitas.' })}
                ${inputField({ name: 'password', label: 'Senha inicial', type: 'password', required: true, autocomplete: 'new-password', maxlength: 1024, hint: 'Mínimo de 8 caracteres. Informe-a ao usuário por um canal seguro e peça que a troque no primeiro acesso.' })}`,
            }),
        });
    },
    'user-edit'(button) {
        openModal({
            title: 'Editar usuário',
            body: modalForm({
                name: 'user-update',
                ref: button.dataset.id,
                submitLabel: 'Salvar',
                body: html`${inputField({ name: 'fullName', label: 'Nome completo', required: true, value: button.dataset.name, maxlength: 120 })}
                ${selectField({ name: 'role', label: 'Perfil', value: button.dataset.role, emptyLabel: null, options: opts(LABELS.role), hint: 'Ao mudar o perfil, as sessões abertas do usuário são encerradas.' })}`,
            }),
        });
    },
    async 'user-deactivate'(button) {
        const ok = await confirmDialog({
            title: `Desativar ${button.dataset.name}?`,
            confirmLabel: 'Desativar usuário',
            danger: true,
            message:
                'O usuário perde o acesso imediatamente e suas sessões são encerradas. Visitas em aberto atribuídas a ele voltam para a fila “sem responsável”. O histórico é preservado.',
        });
        if (ok) await changeStatus(button.dataset.id, 'inativo');
    },
    async 'user-activate'(button) {
        const ok = await confirmDialog({
            title: `Reativar ${button.dataset.name}?`,
            confirmLabel: 'Reativar usuário',
            message: 'O usuário voltará a poder entrar no sistema com a senha atual.',
        });
        if (ok) await changeStatus(button.dataset.id, 'ativo');
    },
});

async function changeStatus(id, status) {
    const { data } = await api.patch(`/users/${encodeURIComponent(id)}/status`, { status });
    if (data.releasedVisits)
        toast(`${data.releasedVisits} visita(s) voltaram para distribuição.`, 'warning', 'Usuário desativado');
    else toastSuccess(status === 'ativo' ? 'Usuário reativado.' : 'Usuário desativado.');
    refreshRoute({ silent: true });
}

registerForms({
    'user-create'(form) {
        return handleSubmit(form, async () => {
            const v = readForm(form);
            if (!isPersonName(v.fullName)) setFieldError(form, 'fullName', 'Informe o nome completo (apenas letras).');
            if (!isEmail(v.email)) setFieldError(form, 'email', 'Informe um e-mail válido.');
            if (v.password.length < 8) setFieldError(form, 'password', 'Use ao menos 8 caracteres.');
            if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
            await api.post('/users', { fullName: v.fullName, email: v.email, role: v.role, password: v.password });
            closeModal(form);
            toastSuccess('Usuário cadastrado.');
            return refreshRoute({ silent: true });
        });
    },
    'user-update'(form) {
        return handleSubmit(form, async () => {
            const v = readForm(form);
            if (!isPersonName(v.fullName)) {
                setFieldError(form, 'fullName', 'Informe o nome completo (apenas letras).');
                return focusFirstInvalid(form);
            }
            await api.patch(`/users/${encodeURIComponent(form.dataset.ref)}`, { fullName: v.fullName, role: v.role });
            closeModal(form);
            toastSuccess('Usuário atualizado.');
            return refreshRoute({ silent: true });
        });
    },
});
