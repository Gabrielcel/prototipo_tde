import { api } from '../../services/api.js';
import { getState, isManager } from '../../core/state.js';
import { loadDirectory } from '../../services/auth.js';
import { html } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { badge, emptyState, pageHeader, pagination } from '../../components/ui.js';
import { closeModal, openModal } from '../../components/modal.js';
import {
    focusFirstInvalid,
    handleSubmit,
    inputField,
    modalForm,
    readForm,
    selectField,
    setFieldError,
    textareaField,
} from '../../components/forms.js';
import { registerActions, registerChanges, registerForms, registerInputs } from '../../core/actions.js';
import { navigate, refreshRoute, setTitle } from '../../core/router.js';
import { toastSuccess } from '../../components/notification.js';
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../../core/config.js';
import { debounce } from '../../utils/helpers.js';
import {
    dateKey,
    formatDate,
    formatDateTime,
    formatTime,
    relativeDay,
    todayKey,
    zonedToInstant,
} from '../../utils/formatters.js';

const STATUS_FILTERS = [
    { value: 'abertas', label: 'Em aberto' },
    { value: 'agendada', label: 'Agendadas' },
    { value: 'sem_responsavel', label: 'Sem responsável' },
    { value: 'reagendada', label: 'Reagendadas' },
    { value: 'concluida', label: 'Concluídas' },
    { value: 'cancelada', label: 'Canceladas' },
    { value: 'todas', label: 'Todas' },
];
const priorityOptions = () =>
    Object.entries({ alta: 'Alta', media: 'Média', baixa: 'Baixa' }).map(([value, text]) => ({ value, label: text }));
const isOpen = (visit) => ['agendada', 'reagendada', 'sem_responsavel'].includes(visit.status);

async function volunteerOptions() {
    const directory = await loadDirectory(getState());
    return directory
        .filter((person) => person.role === 'voluntario')
        .map((person) => ({ value: person.id, label: person.fullName }));
}

function rowActions(visit) {
    const manager = isManager();
    const mine = visit.assignedTo === getState().user.id;
    return html`<a class="btn btn-sm" href="#/agenda/${encodeURIComponent(visit.id)}">Ver</a>
        ${isOpen(visit) && visit.assignedTo && (mine || manager) ? html`<a class="btn btn-sm btn-primary" href="#/agenda/${encodeURIComponent(visit.id)}/registro">${icon('clipboard-check')}Registrar</a>` : ''}
        ${
            manager && isOpen(visit)
                ? html` <button
                          type="button"
                          class="btn btn-sm"
                          data-action="visit-reschedule"
                          data-id="${visit.id}"
                          data-at="${visit.scheduledAt}"
                          aria-label="Reagendar visita"
                          title="Reagendar visita"
                      >
                          ${icon('calendar-clock')}
                      </button>
                      <button
                          type="button"
                          class="btn btn-sm"
                          data-action="visit-assign"
                          data-id="${visit.id}"
                          data-volunteer="${visit.assignedTo ?? ''}"
                          aria-label="Atribuir responsável"
                          title="Atribuir responsável"
                      >
                          ${icon('user-round-check')}
                      </button>
                      <button
                          type="button"
                          class="btn btn-sm btn-danger"
                          data-action="visit-cancel"
                          data-id="${visit.id}"
                          aria-label="Cancelar visita"
                          title="Cancelar visita"
                      >
                          ${icon('ban')}
                      </button>`
                : ''
        }`;
}

export async function renderAgenda({ query }) {
    const manager = isManager();
    const status = query.status || 'abertas';
    const page = Number(query.page) || 1;
    const filters = { status, from: query.from ?? '', to: query.to ?? '', volunteerId: query.volunteerId ?? '' };
    const closedView = ['concluida', 'cancelada', 'todas'].includes(status);
    const [{ data, pagination: info }, volunteers] = await Promise.all([
        api.get('/visits', {
            status: status === 'todas' ? '' : status,
            from: filters.from,
            to: filters.to,
            volunteerId: manager ? filters.volunteerId : '',
            order: closedView ? 'desc' : 'asc',
            page,
            limit: PAGE_SIZE,
        }),
        manager ? volunteerOptions() : [],
    ]);
    const hasFilters = status !== 'abertas' || filters.from || filters.to || filters.volunteerId;

    return html`${pageHeader({
            title: 'Agenda de visitas',
            subtitle: manager ? 'Agende, distribua e acompanhe as visitas.' : 'Suas visitas atribuídas.',
            actions: manager
                ? html`<button type="button" class="btn btn-primary" data-action="open-schedule">
                      ${icon('calendar-plus')}Agendar visita
                  </button>`
                : '',
        })}
        <section class="card">
            <form class="filters" data-form="agenda-filters" aria-label="Filtrar visitas">
                ${selectField({ name: 'status', label: 'Situação', value: status, emptyLabel: null, options: STATUS_FILTERS, change: 'agenda-filter-change' })}
                ${inputField({ name: 'from', label: 'De', type: 'date', value: filters.from })}
                ${inputField({ name: 'to', label: 'Até', type: 'date', value: filters.to })}
                ${manager ? selectField({ name: 'volunteerId', label: 'Voluntário', value: filters.volunteerId, emptyLabel: 'Todos', options: volunteers, change: 'agenda-filter-change' }) : ''}
                <button type="submit" class="btn">${icon('search')}Filtrar</button>
            </form>
            ${
                data.length
                    ? html`<div class="table-wrap">
                              <table class="data">
                                  <caption class="sr-only">
                                      Visitas
                                  </caption>
                                  <thead>
                                      <tr>
                                          <th scope="col">Quando</th>
                                          <th scope="col">Família</th>
                                          <th scope="col">Bairro</th>
                                          <th scope="col">Responsável</th>
                                          <th scope="col">Prioridade</th>
                                          <th scope="col">Situação</th>
                                          <th scope="col"><span class="sr-only">Ações</span></th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${data.map(
                                          (visit) =>
                                              html`<tr>
                                                  <td data-l="Quando">
                                                      <span
                                                          ><span class="text-strong"
                                                              >${relativeDay(visit.scheduledAt)}</span
                                                          >
                                                          · ${formatDate(visit.scheduledAt)}
                                                          ${formatTime(visit.scheduledAt)}</span
                                                      >
                                                  </td>
                                                  <td data-l="Família">
                                                      <a href="#/familias/${encodeURIComponent(visit.familyId)}"
                                                          >${visit.familyContact}</a
                                                      >
                                                      <span class="text-muted text-small">(${visit.familyCode})</span>
                                                  </td>
                                                  <td data-l="Bairro">${visit.neighborhood}</td>
                                                  <td data-l="Responsável">${visit.volunteerName ?? '—'}</td>
                                                  <td data-l="Prioridade">${badge('priority', visit.priority)}</td>
                                                  <td data-l="Situação">${badge('visitStatus', visit.status)}</td>
                                                  <td class="cell-actions">${rowActions(visit)}</td>
                                              </tr>`
                                      )}
                                  </tbody>
                              </table>
                          </div>
                          ${pagination(info, '/agenda', filters)}`
                    : emptyState({
                          iconName: 'calendar-days',
                          title: hasFilters ? 'Nenhuma visita encontrada' : 'Nenhuma visita em aberto',
                          text: hasFilters
                              ? 'Nenhum registro corresponde aos filtros utilizados.'
                              : manager
                                ? 'Agende uma visita para começar.'
                                : 'Você não tem visitas em aberto.',
                          action: hasFilters ? html`<a class="btn" href="#/agenda">Limpar filtros</a>` : '',
                      })
            }
        </section>`;
}

function detailActions(visit) {
    const manager = isManager();
    const mine = visit.assignedTo === getState().user.id;
    if (!isOpen(visit)) return '';
    return html`${visit.assignedTo && (mine || manager) ? html`<a class="btn btn-primary" href="#/agenda/${encodeURIComponent(visit.id)}/registro">${icon('clipboard-check')}Registrar visita</a>` : ''}
    ${
        manager
            ? html`<button
                      type="button"
                      class="btn"
                      data-action="visit-reschedule"
                      data-id="${visit.id}"
                      data-at="${visit.scheduledAt}"
                  >
                      ${icon('calendar-clock')}Reagendar
                  </button>
                  <button
                      type="button"
                      class="btn"
                      data-action="visit-assign"
                      data-id="${visit.id}"
                      data-volunteer="${visit.assignedTo ?? ''}"
                  >
                      ${icon('user-round-check')}Atribuir
                  </button>
                  <button type="button" class="btn btn-danger" data-action="visit-cancel" data-id="${visit.id}">
                      ${icon('ban')}Cancelar visita
                  </button>`
            : ''
    }`;
}

const HISTORY_LABELS = {
    criada: 'Visita criada',
    reagendada: 'Reagendada',
    atribuida: 'Responsável atribuído',
    desatribuida: 'Responsável removido',
    cancelada: 'Cancelada',
    concluida: 'Concluída',
};

export async function renderVisit({ params }) {
    const { data: visit } = await api.get(`/visits/${encodeURIComponent(params.id)}`);
    setTitle(`Visita — ${visit.familyContact}`);
    return html`${pageHeader({
            back: { href: '#/agenda', label: 'Agenda' },
            title: `Visita a ${visit.familyContact}`,
            subtitle: html`${formatDateTime(visit.scheduledAt)} · ${badge('visitStatus', visit.status)}`,
            actions: detailActions(visit),
        })}
        <div class="stack">
            <section class="card" aria-labelledby="v-info">
                <div class="card-header"><h2 id="v-info">Informações</h2></div>
                <div class="card-body">
                    <dl class="info-list">
                        <div>
                            <dt>Família</dt>
                            <dd>
                                <a href="#/familias/${encodeURIComponent(visit.familyId)}">${visit.familyContact}</a>
                                (${visit.familyCode})
                            </dd>
                        </div>
                        <div>
                            <dt>Bairro</dt>
                            <dd>${visit.neighborhood}</dd>
                        </div>
                        <div>
                            <dt>Responsável</dt>
                            <dd>${visit.volunteerName ?? 'Sem responsável'}</dd>
                        </div>
                        <div>
                            <dt>Prioridade</dt>
                            <dd>${badge('priority', visit.priority)}</dd>
                        </div>
                        ${
                            visit.reason
                                ? html`<div>
                                      <dt>Último motivo registrado</dt>
                                      <dd>${visit.reason}</dd>
                                  </div>`
                                : ''
                        }
                    </dl>
                </div>
            </section>
            ${
                visit.record
                    ? html`<section class="card" aria-labelledby="v-rec">
                          <div class="card-header">
                              <h2 id="v-rec">Registro da visita</h2>
                              <span class="text-muted text-small"
                                  >Por ${visit.record.completedByName ?? '—'} em
                                  ${formatDateTime(visit.record.completedAt)}</span
                              >
                          </div>
                          <div class="table-wrap">
                              <table class="data">
                                  <caption class="sr-only">
                                      Checklist
                                  </caption>
                                  <thead>
                                      <tr>
                                          <th scope="col">Item</th>
                                          <th scope="col">Resposta</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${visit.record.checklist.map(
                                          (entry) =>
                                              html`<tr>
                                                  <td data-l="Item">${entry.item}</td>
                                                  <td data-l="Resposta" class="cell-main">${entry.answer}</td>
                                              </tr>`
                                      )}
                                  </tbody>
                              </table>
                          </div>
                          <div class="card-body stack-sm">
                              ${
                                  visit.record.conditions
                                      ? html`<div>
                                            <h3>Condições observadas</h3>
                                            <p>${visit.record.conditions}</p>
                                        </div>`
                                      : ''
                              }
                              ${
                                  visit.record.observations
                                      ? html`<div>
                                            <h3>Observações</h3>
                                            <p>${visit.record.observations}</p>
                                        </div>`
                                      : ''
                              }
                          </div>
                      </section>`
                    : ''
            }
            ${
                visit.needs.length
                    ? html`<section class="card" aria-labelledby="v-needs">
                          <div class="card-header">
                              <h2 id="v-needs">Necessidades registradas</h2>
                              <a class="btn btn-sm" href="#/necessidades">Acompanhar</a>
                          </div>
                          <ul class="list-rows">
                              ${visit.needs.map(
                                  (need) =>
                                      html`<li>
                                          <div class="grow">
                                              <span class="text-strong">${need.category}</span
                                              ><span class="text-muted text-small">${need.description}</span>
                                          </div>
                                          ${badge('priority', need.priority)}${badge('needStatus', need.status)}
                                      </li>`
                              )}
                          </ul>
                      </section>`
                    : ''
            }
            ${
                visit.history.length
                    ? html`<section class="card" aria-labelledby="v-hist">
                          <div class="card-header"><h2 id="v-hist">Histórico da visita</h2></div>
                          <ul class="timeline card-body">
                              ${visit.history.map(
                                  (entry) =>
                                      html`<li>
                                          <strong>${HISTORY_LABELS[entry.action] ?? entry.action}</strong> —
                                          ${formatDateTime(entry.createdAt)} por ${entry.userName ?? '—'}
                                          ${entry.action === 'reagendada' ? html`<br /><span class="text-muted">De ${formatDateTime(entry.oldScheduledAt)} para ${formatDateTime(entry.newScheduledAt)}</span>` : ''}
                                          ${entry.newVolunteer || entry.oldVolunteer ? html`<br /><span class="text-muted">${entry.oldVolunteer ?? 'Sem responsável'} → ${entry.newVolunteer ?? 'Sem responsável'}</span>` : ''}
                                          ${entry.reason ? html`<br /><span class="text-muted">Motivo: ${entry.reason}</span>` : ''}
                                      </li>`
                              )}
                          </ul>
                      </section>`
                    : ''
            }
        </div>`;
}

// ---- Filtros da agenda -----------------------------------------------------------------
const applyAgendaFilters = (form) => {
    const data = new FormData(form);
    navigate(
        '/agenda',
        {
            status: data.get('status'),
            from: data.get('from'),
            to: data.get('to'),
            volunteerId: data.get('volunteerId'),
        },
        { replace: true, silent: true }
    );
};
registerChanges({ 'agenda-filter-change': (element) => applyAgendaFilters(element.form) });
registerForms({ 'agenda-filters': (form) => applyAgendaFilters(form) });

// ---- Janelas de agendamento ------------------------------------------------------------
const familyOptionTags = (families) =>
    families.map((family) => ({
        value: family.id,
        label: `${family.code} — ${family.contactName} (${family.neighborhood})`,
    }));

async function fillFamilySelect(select, search = '') {
    const { data } = await api.get('/families/options', { search });
    select.innerHTML = html`<option value="">Selecione a família</option>
        ${familyOptionTags(data).map((o) => html`<option value="${o.value}">${o.label}</option>`)}`.value;
}

const searchFamilies = debounce(
    (input) => fillFamilySelect(document.getElementById('f-familyId'), input.value.trim()),
    SEARCH_DEBOUNCE_MS
);
registerInputs({ 'schedule-family-search': (input) => searchFamilies(input) });

registerActions({
    async 'open-schedule'(button) {
        const familyId = button.dataset.familyId ?? '';
        const [volunteers, families] = await Promise.all([
            volunteerOptions(),
            familyId ? { data: [] } : api.get('/families/options'),
        ]);
        openModal({
            title: 'Agendar visita',
            body: modalForm({
                name: 'visit-create',
                ref: familyId,
                submitLabel: 'Agendar visita',
                body: html`${
                        familyId
                            ? ''
                            : html`<div class="field">
                                      <label for="f-family-search">Buscar família</label>
                                      <input
                                          class="input"
                                          id="f-family-search"
                                          type="search"
                                          maxlength="100"
                                          placeholder="Nome ou código"
                                          data-input="schedule-family-search"
                                          autocomplete="off"
                                      />
                                  </div>
                                  ${selectField({ name: 'familyId', label: 'Família', required: true, emptyLabel: 'Selecione a família', options: familyOptionTags(families.data) })}`
                    }
                    <div class="form-grid">
                        ${inputField({ name: 'date', label: 'Data', type: 'date', required: true, min: todayKey() })}
                        ${inputField({ name: 'time', label: 'Horário', type: 'time', required: true, value: '09:00' })}
                    </div>
                    ${selectField({ name: 'priority', label: 'Prioridade', value: 'media', emptyLabel: null, options: priorityOptions() })}
                    ${selectField({ name: 'assignedTo', label: 'Voluntário responsável', emptyLabel: 'Sem responsável (distribuir depois)', options: volunteers, hint: 'O sistema impede dois horários com menos de 60 minutos de intervalo para a mesma família ou voluntário.' })}`,
            }),
        });
    },
    async 'visit-reschedule'(button) {
        openModal({
            title: 'Reagendar visita',
            body: modalForm({
                name: 'visit-reschedule',
                ref: button.dataset.id,
                submitLabel: 'Reagendar',
                body: html`<div class="form-grid">
                        ${inputField({ name: 'date', label: 'Nova data', type: 'date', required: true, value: dateKey(button.dataset.at), min: todayKey() })}
                        ${inputField({ name: 'time', label: 'Novo horário', type: 'time', required: true, value: formatTime(button.dataset.at) })}
                    </div>
                    ${textareaField({ name: 'reason', label: 'Motivo do reagendamento', required: true, maxlength: 1000 })}`,
            }),
        });
    },
    async 'visit-assign'(button) {
        const volunteers = await volunteerOptions();
        openModal({
            title: 'Atribuir responsável',
            body: modalForm({
                name: 'visit-assign',
                ref: button.dataset.id,
                submitLabel: 'Salvar',
                body: selectField({
                    name: 'assignedTo',
                    label: 'Voluntário responsável',
                    value: button.dataset.volunteer,
                    emptyLabel: 'Sem responsável',
                    options: volunteers,
                    hint: 'Escolha “Sem responsável” para devolver a visita à fila de distribuição.',
                }),
            }),
        });
    },
    'visit-cancel'(button) {
        openModal({
            title: 'Cancelar visita',
            body: modalForm({
                name: 'visit-cancel',
                ref: button.dataset.id,
                submitLabel: 'Cancelar visita',
                cancelLabel: 'Voltar',
                danger: true,
                body: html`<p>
                        A visita será marcada como cancelada e deixará de aparecer na agenda em aberto. O histórico e o
                        motivo ficam registrados.
                    </p>
                    ${textareaField({ name: 'reason', label: 'Motivo do cancelamento', required: true, maxlength: 1000 })}`,
            }),
        });
    },
});

function readDateTime(form) {
    const { date, time } = readForm(form);
    if (!date) setFieldError(form, 'date', 'Informe a data.');
    if (!time) setFieldError(form, 'time', 'Informe o horário.');
    if (!date || !time) return null;
    const instant = zonedToInstant(date, time);
    if (new Date(instant).getTime() <= Date.now()) {
        setFieldError(form, 'date', 'Escolha um horário futuro.');
        return null;
    }
    return instant;
}

const finish = (form, message) => {
    closeModal(form);
    toastSuccess(message);
    refreshRoute({ silent: true });
};

registerForms({
    'visit-create'(form) {
        return handleSubmit(form, async () => {
            const values = readForm(form);
            const familyId = form.dataset.ref || values.familyId;
            if (!familyId) setFieldError(form, 'familyId', 'Selecione a família.');
            const scheduledAt = readDateTime(form);
            if (!familyId || !scheduledAt) return focusFirstInvalid(form);
            await api.post('/visits', {
                familyId,
                scheduledAt,
                priority: values.priority,
                assignedTo: values.assignedTo || null,
            });
            return finish(form, 'Visita agendada.');
        });
    },
    'visit-reschedule'(form) {
        return handleSubmit(form, async () => {
            const { reason } = readForm(form);
            if (!reason) setFieldError(form, 'reason', 'Informe o motivo.');
            const scheduledAt = readDateTime(form);
            if (!reason || !scheduledAt) return focusFirstInvalid(form);
            await api.patch(`/visits/${encodeURIComponent(form.dataset.ref)}`, { scheduledAt, reason });
            return finish(form, 'Visita reagendada.');
        });
    },
    'visit-assign'(form) {
        return handleSubmit(form, async () => {
            const { assignedTo } = readForm(form);
            await api.patch(`/visits/${encodeURIComponent(form.dataset.ref)}`, { assignedTo: assignedTo || null });
            return finish(form, 'Responsável atualizado.');
        });
    },
    'visit-cancel'(form) {
        return handleSubmit(form, async () => {
            const { reason } = readForm(form);
            if (!reason) {
                setFieldError(form, 'reason', 'Informe o motivo do cancelamento.');
                return focusFirstInvalid(form);
            }
            await api.patch(`/visits/${encodeURIComponent(form.dataset.ref)}`, { status: 'cancelada', reason });
            return finish(form, 'Visita cancelada.');
        });
    },
});
