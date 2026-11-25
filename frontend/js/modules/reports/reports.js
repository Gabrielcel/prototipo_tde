import { api } from '../../services/api.js';
import { loadDirectory } from '../../services/auth.js';
import { getState } from '../../core/state.js';
import { html } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { emptyState, pageHeader, statCard } from '../../components/ui.js';
import { inputField, selectField } from '../../components/forms.js';
import { registerActions, registerChanges, registerForms } from '../../core/actions.js';
import { currentRoute, navigate } from '../../core/router.js';
import { withLoading } from '../../components/buttons.js';
import { toastSuccess } from '../../components/notification.js';
import { LABELS, addDays, monthStart, todayKey } from '../../utils/formatters.js';

const PERIODS = [
    { value: 'all', label: 'Todo o período' },
    { value: '7d', label: 'Últimos 7 dias' },
    { value: 'month', label: 'Mês atual' },
    { value: 'custom', label: 'Período personalizado' },
];

function bars(map, labels = {}) {
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return html`<p class="text-muted">Sem registros no período.</p>`;
    const max = Math.max(...entries.map(([, total]) => total));
    return entries.map(
        ([key, total]) =>
            html`<div class="bar-row">
                <span>${labels[key] ?? key}</span>
                <progress max="${max}" value="${total}" aria-label="${labels[key] ?? key}: ${total}"></progress
                ><span class="bar-total">${total}</span>
            </div>`
    );
}

export async function renderReports({ query }) {
    const filters = { from: query.from ?? '', to: query.to ?? '', volunteerId: query.volunteerId ?? '' };
    const period = query.period || (filters.from || filters.to ? 'custom' : 'all');
    const [{ data }, directory] = await Promise.all([api.get('/reports/summary', filters), loadDirectory(getState())]);
    const volunteers = directory
        .filter((person) => person.role === 'voluntario')
        .map((person) => ({ value: person.id, label: person.fullName }));
    const v = data.visits.byStatus;
    const n = data.needs.byStatus;
    const r = data.referrals.byStatus;
    const nothing = !data.visits.total && !data.needs.total && !data.referrals.total;

    return html`${pageHeader({
            title: 'Relatórios',
            subtitle: 'Indicadores calculados diretamente dos registros do sistema.',
            actions: html`<button type="button" class="btn" data-action="export-csv">
                ${icon('download')}Exportar visitas (CSV)
            </button>`,
        })}
        <div class="stack">
            <section class="card">
                <form class="filters" data-form="report-filters" aria-label="Filtros do relatório">
                    ${selectField({ name: 'period', label: 'Período', value: period, emptyLabel: null, options: PERIODS, change: 'report-filter-change' })}
                    ${inputField({ name: 'from', label: 'De', type: 'date', value: filters.from })}
                    ${inputField({ name: 'to', label: 'Até', type: 'date', value: filters.to })}
                    ${selectField({ name: 'volunteerId', label: 'Voluntário', value: filters.volunteerId, emptyLabel: 'Todos', options: volunteers, change: 'report-filter-change' })}
                    <button type="submit" class="btn btn-primary">Aplicar filtros</button>
                </form>
            </section>
            ${
                nothing
                    ? html`<div class="card">
                          ${emptyState({ iconName: 'chart-no-axes-column', title: 'Nenhum registro no período', text: 'Altere os filtros para ver outros resultados.' })}
                      </div>`
                    : html` <section aria-label="Visitas" class="stack-sm">
                              <h2>Visitas</h2>
                              <div class="grid-stats">
                                  ${statCard({ label: 'Total de visitas', value: data.visits.total })}${statCard({ label: 'Agendadas', value: v.agendada ?? 0 })}
                                  ${statCard({ label: 'Concluídas', value: v.concluida ?? 0, tone: 'positive' })}${statCard({ label: 'Reagendadas', value: v.reagendada ?? 0, tone: 'warning' })}
                                  ${statCard({ label: 'Sem responsável', value: v.sem_responsavel ?? 0, tone: 'warning' })}${statCard({ label: 'Canceladas', value: v.cancelada ?? 0 })}
                              </div>
                          </section>
                          <section aria-label="Necessidades e encaminhamentos" class="stack-sm">
                              <h2>Necessidades e encaminhamentos</h2>
                              <div class="grid-stats">
                                  ${statCard({ label: 'Necessidades registradas', value: data.needs.total })}${statCard({ label: 'Resolvidas', value: n.resolvida ?? 0, tone: 'positive' })}
                                  ${statCard({ label: 'Encaminhamentos', value: data.referrals.total })}${statCard({ label: 'Encaminhamentos concluídos', value: r.concluido ?? 0, tone: 'positive' })}
                              </div>
                          </section>
                          <div class="split-even">
                              <section class="card">
                                  <div class="card-header"><h2>Visitas por voluntário</h2></div>
                                  <div class="card-body">
                                      ${
                                          data.visitsByVolunteer.length
                                              ? data.visitsByVolunteer.map(
                                                    (row) =>
                                                        html`<div class="bar-row">
                                                            <span>${row.name}</span
                                                            ><progress
                                                                max="${data.visitsByVolunteer[0].total}"
                                                                value="${row.total}"
                                                                aria-label="${row.name}: ${row.total}"
                                                            ></progress
                                                            ><span class="bar-total">${row.total}</span>
                                                        </div>`
                                                )
                                              : html`<p class="text-muted">Sem visitas.</p>`
                                      }
                                  </div>
                              </section>
                              <section class="card">
                                  <div class="card-header"><h2>Necessidades por categoria</h2></div>
                                  <div class="card-body">${bars(data.needs.byCategory)}</div>
                              </section>
                              <section class="card">
                                  <div class="card-header"><h2>Necessidades por prioridade</h2></div>
                                  <div class="card-body">${bars(data.needs.byPriority, LABELS.priority)}</div>
                              </section>
                              <section class="card">
                                  <div class="card-header"><h2>Encaminhamentos por situação</h2></div>
                                  <div class="card-body">${bars(data.referrals.byStatus, LABELS.referralStatus)}</div>
                              </section>
                          </div>`
            }
        </div>`;
}

function applyFilters(form, changed) {
    const data = new FormData(form);
    let from = data.get('from');
    let to = data.get('to');
    let period = data.get('period');
    if (changed === 'period') {
        const today = todayKey();
        if (period === 'all') [from, to] = ['', ''];
        else if (period === '7d') [from, to] = [addDays(today, -6), today];
        else if (period === 'month') [from, to] = [monthStart(today), today];
    } else if (changed === 'dates') {
        period = from || to ? 'custom' : 'all';
    }
    navigate(
        '/relatorios',
        { period, from, to, volunteerId: data.get('volunteerId') },
        { replace: true, silent: true }
    );
}

registerChanges({ 'report-filter-change': (element) => applyFilters(element.form, element.name) });
registerForms({ 'report-filters': (form) => applyFilters(form, 'dates') });

registerActions({
    'export-csv': (button) =>
        withLoading(button, async () => {
            const { from, to, volunteerId } = currentRoute().query;
            await api.download('/reports/visits.csv', { from, to, volunteerId }, 'visitas.csv');
            toastSuccess('Arquivo CSV gerado com os filtros atuais.');
        }),
});
