import { api } from '../../services/api.js';
import { getState, isManager } from '../../core/state.js';
import { html } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { badge, emptyState, pageHeader, statCard } from '../../components/ui.js';
import '../visits/visits.js';
import { formatTime, getTimezone, relativeDay, formatDate } from '../../utils/formatters.js';
import { hrefTo } from '../../utils/dom.js';

function greeting(name) {
    const hour = Number(
        new Intl.DateTimeFormat('pt-BR', { timeZone: getTimezone(), hour: '2-digit', hourCycle: 'h23' }).format(
            new Date()
        )
    );
    const part = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${part}, ${name.split(' ')[0]}`;
}

function attentionItems(data, manager) {
    const items = [];
    if (manager && data.visits.unassigned) {
        items.push({
            text: `${data.visits.unassigned} visita(s) sem responsável`,
            href: hrefTo('/agenda', { status: 'sem_responsavel' }),
            action: 'Distribuir',
        });
    }
    if (data.visits.overdue) {
        items.push({
            text: `${data.visits.overdue} visita(s) com data vencida ainda em aberto`,
            href: hrefTo('/agenda', { status: 'abertas', to: new Date().toISOString().slice(0, 10) }),
            action: 'Revisar',
        });
    }
    if (data.needs.withoutReferral) {
        items.push({
            text: `${data.needs.withoutReferral} necessidade(s) sem encaminhamento`,
            href: hrefTo('/necessidades', { hasReferral: 'false' }),
            action: 'Encaminhar',
        });
    }
    if (data.referrals.openMine) {
        items.push({
            text: `${data.referrals.openMine} encaminhamento(s) sob sua responsabilidade`,
            href: hrefTo('/necessidades', { tab: 'encaminhamentos', mine: 'true' }),
            action: 'Acompanhar',
        });
    }
    return items;
}

export async function renderDashboard() {
    const { user } = getState();
    const manager = isManager();
    const { data } = await api.get('/dashboard');
    const attention = attentionItems(data, manager);

    return html`${pageHeader({
            title: greeting(user.fullName),
            subtitle: manager
                ? 'Resumo do acompanhamento das famílias e da agenda.'
                : 'Suas próximas atividades e pendências.',
            actions: manager
                ? html`<a class="btn" href="#/familias/nova">${icon('user-plus')}Nova família</a>
                      <button type="button" class="btn btn-primary" data-action="open-schedule">
                          ${icon('calendar-plus')}Agendar visita
                      </button>`
                : html`<a class="btn btn-primary" href="#/agenda">${icon('calendar-days')}Ver minha agenda</a>`,
        })}
        <div class="stack">
            <section class="grid-stats" aria-label="Indicadores">
                ${statCard({ label: 'Visitas hoje', value: data.visits.today, href: hrefTo('/agenda', { status: 'abertas' }) })}
                ${statCard({ label: 'Próximas visitas', value: data.visits.upcoming, hint: 'A partir de agora', href: hrefTo('/agenda', { status: 'abertas' }) })}
                ${manager ? statCard({ label: 'Sem responsável', value: data.visits.unassigned, tone: data.visits.unassigned ? 'warning' : '', href: hrefTo('/agenda', { status: 'sem_responsavel' }) }) : ''}
                ${statCard({ label: 'Necessidades pendentes', value: data.needs.pending, tone: data.needs.pending ? 'warning' : '', href: hrefTo('/necessidades', { status: 'pendente' }) })}
                ${statCard({ label: 'Concluídas em 30 dias', value: data.visits.completedLast30Days, tone: 'positive', href: hrefTo('/agenda', { status: 'concluida' }) })}
            </section>
            <div class="split">
                <section class="card" aria-labelledby="next-title">
                    <div class="card-header">
                        <h2 id="next-title">Próximas visitas</h2>
                        <a class="btn btn-text btn-sm" href="#/agenda">Ver agenda ${icon('arrow-right')}</a>
                    </div>
                    ${
                        data.upcomingVisits.length
                            ? html`<ul class="list-rows">
                                  ${data.upcomingVisits.map(
                                      (visit) =>
                                          html`<li>
                                              <div class="visit-when">
                                                  ${relativeDay(visit.scheduledAt)}<small
                                                      >${formatDate(visit.scheduledAt)} ·
                                                      ${formatTime(visit.scheduledAt)}</small
                                                  >
                                              </div>
                                              <div class="grow">
                                                  <a class="row-link" href="#/agenda/${encodeURIComponent(visit.id)}"
                                                      >${visit.familyContact}</a
                                                  >
                                                  <span class="text-muted text-small"
                                                      >Família ${visit.familyCode} ·
                                                      ${visit.volunteerName ?? 'Sem responsável'}</span
                                                  >
                                              </div>
                                              ${badge('visitStatus', visit.status)}
                                          </li>`
                                  )}
                              </ul>`
                            : emptyState({
                                  iconName: 'calendar-days',
                                  title: 'Nenhuma visita futura',
                                  text: manager
                                      ? 'Agende uma visita para uma família cadastrada.'
                                      : 'Você não tem visitas agendadas.',
                              })
                    }
                </section>
                <section class="card" aria-labelledby="attention-title">
                    <div class="card-header"><h2 id="attention-title">Pendências</h2></div>
                    ${
                        attention.length
                            ? html`<ul class="list-rows attention-list">
                                  ${attention.map(
                                      (item) =>
                                          html`<li>
                                              ${icon('triangle-alert')}<span class="grow">${item.text}</span
                                              ><a class="btn btn-sm" href="${item.href}">${item.action}</a>
                                          </li>`
                                  )}
                              </ul>`
                            : emptyState({
                                  iconName: 'circle-check',
                                  title: 'Tudo em dia',
                                  text: 'Não há pendências que exijam atenção agora.',
                              })
                    }
                </section>
            </div>
        </div>`;
}
