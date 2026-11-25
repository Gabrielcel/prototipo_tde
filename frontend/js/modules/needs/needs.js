import { api } from '../../services/api.js';
import { getState, isManager } from '../../core/state.js';
import { loadDirectory } from '../../services/auth.js';
import { html, raw } from '../../utils/dom.js';

const CURRENT_PAGE = raw('aria-current="page"');
import { icon } from '../../components/icons.js';
import { badge, emptyState, pageHeader, pagination } from '../../components/ui.js';
import { closeModal, openModal } from '../../components/modal.js';
import {
    focusFirstInvalid,
    handleSubmit,
    modalForm,
    readForm,
    selectField,
    setFieldError,
    textareaField,
} from '../../components/forms.js';
import { registerActions, registerChanges, registerForms } from '../../core/actions.js';
import { navigate, refreshRoute } from '../../core/router.js';
import { toastSuccess, toastError } from '../../components/notification.js';
import { PAGE_SIZE } from '../../core/config.js';
import { LABELS, formatDate } from '../../utils/formatters.js';
import { hrefTo } from '../../utils/dom.js';

const opts = (map) => Object.entries(map).map(([value, text]) => ({ value, label: text }));

/** Estados de destino permitidos (regras vindas do servidor, que também as valida). */
function allowedTargets(transitions, current) {
    const rule = transitions[current];
    const manager = isManager();
    return [current, ...rule.to.filter((to) => manager || !rule.gestorOnly.includes(to))];
}

function referralItem(ref, canReassign) {
    const { meta, user } = getState();
    const editable = isManager() || ref.responsibleUserId === user.id;
    const targets = allowedTargets(meta.referralTransitions, ref.status);
    return html`<div class="referral-item">
        <div class="grow">
            <span class="text-strong">${LABELS.referralType[ref.type]}</span> ·
            <span class="text-muted">${ref.responsibleName ?? 'Sem responsável'}</span>
            ${ref.description ? html`<div class="text-small text-muted">${ref.description}</div>` : ''}
        </div>
        ${
            editable && targets.length > 1
                ? html`<label class="sr-only" for="rs-${ref.id}">Situação do encaminhamento</label>
                      <select
                          class="select select-inline"
                          id="rs-${ref.id}"
                          data-change="referral-status"
                          data-id="${ref.id}"
                          data-current="${ref.status}"
                      >
                          ${targets.map((value) => html`<option value="${value}" ${value === ref.status ? 'selected' : ''}>${LABELS.referralStatus[value]}</option>`)}
                      </select>`
                : badge('referralStatus', ref.status)
        }
        ${canReassign ? html`<button type="button" class="btn btn-sm" data-action="referral-reassign" data-id="${ref.id}" data-responsible="${ref.responsibleUserId ?? ''}" aria-label="Trocar responsável" title="Trocar responsável">${icon('user-round-check')}</button>` : ''}
    </div>`;
}

function needCard(need) {
    const { meta } = getState();
    const manager = isManager();
    const targets = allowedTargets(meta.needTransitions, need.status);
    const canEditStatus = targets.length > 1;
    return html`<article class="need-card" aria-label="Necessidade: ${need.category}">
        <div class="need-head">
            <div class="need-meta">
                <h2 class="need-title">${need.category}</h2>
                ${badge('priority', need.priority)}
                ${
                    canEditStatus
                        ? html`<label class="sr-only" for="ns-${need.id}">Situação da necessidade</label>
                              <select
                                  class="select select-inline"
                                  id="ns-${need.id}"
                                  data-change="need-status"
                                  data-id="${need.id}"
                                  data-current="${need.status}"
                              >
                                  ${targets.map((value) => html`<option value="${value}" ${value === need.status ? 'selected' : ''}>${LABELS.needStatus[value]}</option>`)}
                              </select>`
                        : badge('needStatus', need.status)
                }
            </div>
            <button
                type="button"
                class="btn btn-sm"
                data-action="referral-add"
                data-need="${need.id}"
                ${need.status === 'resolvida' ? 'disabled' : ''}
            >
                ${icon('plus')}Encaminhamento
            </button>
        </div>
        <p>${need.description}</p>
        <p class="text-small text-muted">
            Família
            <a href="#/familias/${encodeURIComponent(need.familyId)}">${need.familyContact}</a> (${need.familyCode}) ·
            registrada em ${formatDate(need.createdAt)}${need.createdByName ? ` por ${need.createdByName}` : ''}
        </p>
        ${need.referrals.length ? html`<div class="referral-list">${need.referrals.map((ref) => referralItem(ref, manager))}</div>` : html`<p class="text-small text-muted">Sem encaminhamentos.</p>`}
    </article>`;
}

function tabs(active, params) {
    return html`<nav class="tabs" aria-label="Seções">
        <a href="${hrefTo('/necessidades', { ...params, tab: '' })}" ${active === 'necessidades' ? CURRENT_PAGE : ''}
            >Necessidades</a
        >
        <a
            href="${hrefTo('/necessidades', { tab: 'encaminhamentos' })}"
            ${active === 'encaminhamentos' ? CURRENT_PAGE : ''}
            >Encaminhamentos</a
        >
    </nav>`;
}

export async function renderNeeds({ query }) {
    const tab = query.tab === 'encaminhamentos' ? 'encaminhamentos' : 'necessidades';
    const page = Number(query.page) || 1;
    const header = pageHeader({
        title: 'Necessidades e encaminhamentos',
        subtitle: 'Acompanhe pendências, responsáveis e andamento de cada encaminhamento.',
        actions: html`<button type="button" class="btn btn-primary" data-action="open-need">
            ${icon('plus')}Registrar necessidade
        </button>`,
    });
    if (tab === 'encaminhamentos') {
        const params = { tab, status: query.status ?? '', mine: query.mine ?? '' };
        const { data, pagination: info } = await api.get('/referrals', {
            status: params.status,
            mine: params.mine,
            page,
            limit: PAGE_SIZE,
        });
        return html`${header}
            <section class="card">
                ${tabs(tab, {})}
                <form class="filters" data-form="needs-filters" aria-label="Filtrar encaminhamentos">
                    <input type="hidden" name="tab" value="encaminhamentos" />
                    ${selectField({ name: 'status', label: 'Situação', value: params.status, emptyLabel: 'Todas', options: opts(LABELS.referralStatus), change: 'needs-filter-change' })}
                    ${selectField({ name: 'mine', label: 'Responsável', value: params.mine, emptyLabel: 'Todos', options: [{ value: 'true', label: 'Somente eu' }], change: 'needs-filter-change' })}
                </form>
                ${
                    data.length
                        ? html`<div class="table-wrap">
                                  <table class="data">
                                      <caption class="sr-only">
                                          Encaminhamentos
                                      </caption>
                                      <thead>
                                          <tr>
                                              <th scope="col">Tipo</th>
                                              <th scope="col">Necessidade</th>
                                              <th scope="col">Família</th>
                                              <th scope="col">Responsável</th>
                                              <th scope="col">Situação</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          ${data.map(
                                              (ref) =>
                                                  html`<tr>
                                                      <td data-l="Tipo">${LABELS.referralType[ref.type]}</td>
                                                      <td data-l="Necessidade">
                                                          <span class="text-strong">${ref.category}</span>
                                                          <div class="text-small text-muted">
                                                              ${ref.needDescription}
                                                          </div>
                                                      </td>
                                                      <td data-l="Família">
                                                          <a href="#/familias/${encodeURIComponent(ref.familyId)}"
                                                              >${ref.familyCode}</a
                                                          >
                                                      </td>
                                                      <td data-l="Responsável">${ref.responsibleName ?? '—'}</td>
                                                      <td data-l="Situação">${referralStatusControl(ref)}</td>
                                                  </tr>`
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                              ${pagination(info, '/necessidades', params)}`
                        : emptyState({
                              iconName: 'clipboard-list',
                              title: 'Nenhum encaminhamento',
                              text:
                                  params.status || params.mine
                                      ? 'Nenhum registro corresponde aos filtros utilizados.'
                                      : 'Ainda não há encaminhamentos registrados.',
                          })
                }
            </section>`;
    }
    const params = {
        status: query.status ?? '',
        priority: query.priority ?? '',
        category: query.category ?? '',
        hasReferral: query.hasReferral ?? '',
    };
    const { data, pagination: info } = await api.get('/needs', { ...params, page, limit: PAGE_SIZE });
    const filtered = Object.values(params).some(Boolean);
    return html`${header}
        <section class="card">
            ${tabs(tab, {})}
            <form class="filters" data-form="needs-filters" aria-label="Filtrar necessidades">
                ${selectField({ name: 'status', label: 'Situação', value: params.status, emptyLabel: 'Todas', options: opts(LABELS.needStatus), change: 'needs-filter-change' })}
                ${selectField({ name: 'priority', label: 'Prioridade', value: params.priority, emptyLabel: 'Todas', options: opts(LABELS.priority), change: 'needs-filter-change' })}
                ${selectField({ name: 'category', label: 'Categoria', value: params.category, emptyLabel: 'Todas', options: getState().meta.needCategories.map((v) => ({ value: v, label: v })), change: 'needs-filter-change' })}
                ${selectField({
                    name: 'hasReferral',
                    label: 'Encaminhamento',
                    value: params.hasReferral,
                    emptyLabel: 'Todos',
                    options: [
                        { value: 'true', label: 'Com encaminhamento' },
                        { value: 'false', label: 'Sem encaminhamento' },
                    ],
                    change: 'needs-filter-change',
                })}
            </form>
            ${
                data.length
                    ? html`<div>${data.map(needCard)}</div>
                          ${pagination(info, '/necessidades', params)}`
                    : emptyState({
                          iconName: 'clipboard-list',
                          title: filtered ? 'Nenhuma necessidade encontrada' : 'Nenhuma necessidade registrada',
                          text: filtered
                              ? 'Nenhum registro corresponde aos filtros utilizados.'
                              : 'As necessidades identificadas nas visitas aparecem aqui.',
                          action: filtered ? html`<a class="btn" href="#/necessidades">Limpar filtros</a>` : '',
                      })
            }
        </section>`;
}

function referralStatusControl(ref) {
    const { meta, user } = getState();
    const editable = isManager() || ref.responsibleUserId === user.id;
    const targets = allowedTargets(meta.referralTransitions, ref.status);
    if (!editable || targets.length < 2) return badge('referralStatus', ref.status);
    return html`<label class="sr-only" for="rt-${ref.id}">Situação</label
        ><select
            class="select select-inline"
            id="rt-${ref.id}"
            data-change="referral-status"
            data-id="${ref.id}"
            data-current="${ref.status}"
        >
            ${targets.map((value) => html`<option value="${value}" ${value === ref.status ? 'selected' : ''}>${LABELS.referralStatus[value]}</option>`)}
        </select>`;
}

async function peopleOptions() {
    const directory = await loadDirectory(getState());
    return directory.map((person) => ({
        value: person.id,
        label: `${person.fullName}${person.role === 'gestor' ? ' (gestor)' : ''}`,
    }));
}

const applyFilters = (form) => {
    const data = new FormData(form);
    const params = Object.fromEntries([...data.entries()].filter(([, value]) => value));
    navigate('/necessidades', params, { replace: true, silent: true });
};
registerChanges({ 'needs-filter-change': (element) => applyFilters(element.form) });
registerForms({ 'needs-filters': (form) => applyFilters(form) });

async function changeStatus(select, path) {
    try {
        await api.patch(`${path}/${encodeURIComponent(select.dataset.id)}`, { status: select.value });
        toastSuccess('Situação atualizada.');
    } catch (error) {
        select.value = select.dataset.current; // desfaz a seleção visual quando o servidor recusa
        toastError(error.message);
        return;
    }
    refreshRoute({ silent: true });
}

registerChanges({
    'need-status': (select) => changeStatus(select, '/needs'),
    'referral-status': (select) => changeStatus(select, '/referrals'),
});

registerActions({
    async 'open-need'(button) {
        const familyId = button.dataset.familyId ?? '';
        const families = familyId ? [] : (await api.get('/families/options')).data;
        openModal({
            title: 'Registrar necessidade',
            body: modalForm({
                name: 'need-create',
                ref: familyId,
                submitLabel: 'Registrar',
                body: html`${familyId ? '' : selectField({ name: 'familyId', label: 'Família', required: true, emptyLabel: 'Selecione a família', options: families.map((f) => ({ value: f.id, label: `${f.code} — ${f.contactName}` })) })}
                ${selectField({ name: 'category', label: 'Categoria', required: true, emptyLabel: 'Selecione', options: getState().meta.needCategories.map((v) => ({ value: v, label: v })) })}
                ${selectField({ name: 'priority', label: 'Prioridade', value: 'media', emptyLabel: null, options: opts(LABELS.priority) })}
                ${textareaField({ name: 'description', label: 'Descrição', required: true, maxlength: 2000 })}`,
            }),
        });
    },
    async 'referral-add'(button) {
        openModal({
            title: 'Novo encaminhamento',
            body: modalForm({
                name: 'referral-create',
                ref: button.dataset.need,
                submitLabel: 'Criar encaminhamento',
                body: html`${selectField({ name: 'type', label: 'Tipo', value: 'encaminhamento', emptyLabel: null, options: opts(LABELS.referralType) })}
                ${selectField({ name: 'responsibleUserId', label: 'Responsável', required: true, emptyLabel: 'Selecione', options: await peopleOptions() })}
                ${textareaField({ name: 'description', label: 'Descrição', maxlength: 2000 })}`,
            }),
        });
    },
    async 'referral-reassign'(button) {
        openModal({
            title: 'Trocar responsável',
            body: modalForm({
                name: 'referral-reassign',
                ref: button.dataset.id,
                submitLabel: 'Salvar',
                body: selectField({
                    name: 'responsibleUserId',
                    label: 'Responsável',
                    required: true,
                    value: button.dataset.responsible,
                    emptyLabel: 'Selecione',
                    options: await peopleOptions(),
                }),
            }),
        });
    },
});

const done = (form, message) => {
    closeModal(form);
    toastSuccess(message);
    refreshRoute({ silent: true });
};

registerForms({
    'need-create'(form) {
        return handleSubmit(form, async () => {
            const v = readForm(form);
            const familyId = form.dataset.ref || v.familyId;
            if (!familyId) setFieldError(form, 'familyId', 'Selecione a família.');
            if (!v.category) setFieldError(form, 'category', 'Selecione a categoria.');
            if (!v.description) setFieldError(form, 'description', 'Descreva a necessidade.');
            if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
            await api.post('/needs', {
                familyId,
                category: v.category,
                priority: v.priority,
                description: v.description,
            });
            return done(form, 'Necessidade registrada.');
        });
    },
    'referral-create'(form) {
        return handleSubmit(form, async () => {
            const v = readForm(form);
            if (!v.responsibleUserId) {
                setFieldError(form, 'responsibleUserId', 'Escolha o responsável.');
                return focusFirstInvalid(form);
            }
            await api.post(`/needs/${encodeURIComponent(form.dataset.ref)}/referrals`, {
                type: v.type,
                responsibleUserId: v.responsibleUserId,
                description: v.description,
            });
            return done(form, 'Encaminhamento criado.');
        });
    },
    'referral-reassign'(form) {
        return handleSubmit(form, async () => {
            const { responsibleUserId } = readForm(form);
            if (!responsibleUserId) {
                setFieldError(form, 'responsibleUserId', 'Escolha o responsável.');
                return focusFirstInvalid(form);
            }
            await api.patch(`/referrals/${encodeURIComponent(form.dataset.ref)}`, { responsibleUserId });
            return done(form, 'Responsável atualizado.');
        });
    },
});
