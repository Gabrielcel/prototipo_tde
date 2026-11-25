import { api } from '../../services/api.js';
import { isManager } from '../../core/state.js';
import { html } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { badge, emptyState, pageHeader, pagination } from '../../components/ui.js';
import { selectField } from '../../components/forms.js';
import { formatDate, formatDateOnly, formatDateTime, ageFrom, label } from '../../utils/formatters.js';
import { registerActions, registerForms, registerInputs, registerChanges } from '../../core/actions.js';
import { navigate, setTitle } from '../../core/router.js';
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../../core/config.js';
import { debounce } from '../../utils/helpers.js';
import { withLoading } from '../../components/buttons.js';
import '../visits/visits.js';
import '../needs/needs.js';
import './families-members.js';

const statusOptions = Object.entries({
    cadastro_recente: 'Cadastro recente',
    aguardando_visita: 'Aguardando visita',
    em_acompanhamento: 'Em acompanhamento',
}).map(([value, text]) => ({ value, label: text }));

export async function renderList({ query }) {
    const page = Number(query.page) || 1;
    const params = { search: query.search ?? '', status: query.status ?? '' };
    const { data, pagination: info } = await api.get('/families', { ...params, page, limit: PAGE_SIZE });
    const filtered = Boolean(params.search || params.status);

    return html`${pageHeader({
            title: 'Famílias',
            subtitle: isManager()
                ? 'Cadastre e acompanhe as famílias atendidas.'
                : 'Famílias com visitas sob sua responsabilidade.',
            actions: isManager()
                ? html`<a class="btn btn-primary" href="#/familias/nova">${icon('plus')}Nova família</a>`
                : '',
        })}
        <section class="card">
            <form class="filters" role="search" data-form="family-filters" aria-label="Filtrar famílias">
                <div class="field field-grow">
                    <label for="f-search">Buscar</label>
                    <div class="input-search">
                        ${icon('search')}<input
                            class="input"
                            id="f-search"
                            name="search"
                            type="search"
                            value="${params.search}"
                            placeholder="Nome, código, bairro ou telefone"
                            maxlength="100"
                            data-input="family-search"
                            autocomplete="off"
                        />
                    </div>
                </div>
                ${selectField({ name: 'status', label: 'Situação', value: params.status, emptyLabel: 'Todas', options: statusOptions, change: 'family-filter-change' })}
            </form>
            ${
                data.length
                    ? html`<div class="table-wrap">
                              <table class="data">
                                  <caption class="sr-only">
                                      Lista de famílias
                                  </caption>
                                  <thead>
                                      <tr>
                                          <th scope="col">Código</th>
                                          <th scope="col">Responsável</th>
                                          <th scope="col">Bairro</th>
                                          <th scope="col">Telefone</th>
                                          <th scope="col">Integrantes</th>
                                          <th scope="col">Situação</th>
                                          <th scope="col">Próxima visita</th>
                                          <th scope="col"><span class="sr-only">Ações</span></th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${data.map(
                                          (family) =>
                                              html`<tr>
                                                  <td data-l="Código">${family.code}</td>
                                                  <td data-l="Responsável" class="cell-main">
                                                      <a href="#/familias/${encodeURIComponent(family.id)}"
                                                          >${family.contactName}</a
                                                      >
                                                  </td>
                                                  <td data-l="Bairro">${family.neighborhood}</td>
                                                  <td data-l="Telefone">${family.phone}</td>
                                                  <td data-l="Integrantes">${family.memberCount}</td>
                                                  <td data-l="Situação">${badge('familyStatus', family.status)}</td>
                                                  <td data-l="Próxima visita">
                                                      ${family.nextVisit ? formatDate(family.nextVisit) : '—'}
                                                  </td>
                                                  <td class="cell-actions">
                                                      <a
                                                          class="btn btn-sm"
                                                          href="#/familias/${encodeURIComponent(family.id)}"
                                                          >Abrir</a
                                                      >
                                                  </td>
                                              </tr>`
                                      )}
                                  </tbody>
                              </table>
                          </div>
                          ${pagination(info, '/familias', params)}`
                    : emptyState({
                          iconName: filtered ? 'search' : 'users',
                          title: filtered ? 'Nenhuma família encontrada' : 'Nenhuma família cadastrada',
                          text: filtered
                              ? 'Nenhum registro corresponde aos filtros utilizados. Tente outros termos.'
                              : isManager()
                                ? 'Cadastre a primeira família para começar.'
                                : 'Você ainda não possui famílias atribuídas.',
                          action:
                              !filtered && isManager()
                                  ? html`<a class="btn btn-primary" href="#/familias/nova"
                                        >${icon('plus')}Cadastrar família</a
                                    >`
                                  : filtered
                                    ? html`<a class="btn" href="#/familias">Limpar filtros</a>`
                                    : '',
                      })
            }
        </section>`;
}

function infoItem(term, value) {
    return html`<div>
        <dt>${term}</dt>
        <dd>${value || '—'}</dd>
    </div>`;
}

export async function renderDetail({ params }) {
    const manager = isManager();
    const { data: family } = await api.get(`/families/${encodeURIComponent(params.id)}`);
    setTitle(`Família ${family.code}`);

    return html`${pageHeader({
            back: { href: '#/familias', label: 'Famílias' },
            title: family.contactName,
            subtitle: html`Família ${family.code} · ${badge('familyStatus', family.status)}`,
            actions: html`${
                    manager
                        ? html`<a class="btn" href="#/familias/${encodeURIComponent(family.id)}/editar"
                                  >${icon('pencil')}Editar</a
                              >
                              <button
                                  type="button"
                                  class="btn btn-primary"
                                  data-action="open-schedule"
                                  data-family-id="${family.id}"
                              >
                                  ${icon('calendar-plus')}Agendar visita
                              </button>`
                        : ''
                }
                <button type="button" class="btn" data-action="open-need" data-family-id="${family.id}">
                    ${icon('clipboard-list')}Registrar necessidade
                </button>`,
        })}
        <div class="stack">
            <section class="card" aria-labelledby="dados-title">
                <div class="card-header"><h2 id="dados-title">Dados da família</h2></div>
                <div class="card-body">
                    <dl class="info-list">
                        ${infoItem('Telefone', family.phone)}${infoItem('E-mail', family.email)}
                        ${infoItem('Endereço', `${family.street}, ${family.neighborhood} — ${family.city}`)}${infoItem('CEP', family.postalCode)}
                        ${infoItem('Ocupação do responsável', family.occupation)}${infoItem('Renda familiar', label('income', family.incomeRange))}
                        ${infoItem('Nascimento do responsável', family.birthDate ? `${formatDateOnly(family.birthDate)} (${ageFrom(family.birthDate)} anos)` : '')}
                        ${infoItem('Consentimento', family.consentGiven ? `Registrado em ${formatDate(family.consentRecordedAt)}` : 'Não registrado')}
                    </dl>
                </div>
            </section>

            <section class="card" aria-labelledby="membros-title">
                <div class="card-header">
                    <h2 id="membros-title">Integrantes (${family.members.length})</h2>
                    ${manager ? html`<button type="button" class="btn btn-sm" data-action="member-add" data-family-id="${family.id}">${icon('plus')}Adicionar</button>` : ''}
                </div>
                <div class="table-wrap">
                    <table class="data">
                        <caption class="sr-only">
                            Integrantes da família
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">Nome</th>
                                <th scope="col">Parentesco</th>
                                <th scope="col">Nascimento</th>
                                <th scope="col">Idade</th>
                                ${manager ? html`<th scope="col"><span class="sr-only">Ações</span></th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${family.members.map(
                                (member) =>
                                    html`<tr>
                                        <td data-l="Nome" class="cell-main">${member.fullName}</td>
                                        <td data-l="Parentesco">${member.relationship}</td>
                                        <td data-l="Nascimento">${formatDateOnly(member.birthDate)}</td>
                                        <td data-l="Idade">
                                            ${member.birthDate ? `${ageFrom(member.birthDate)} anos` : '—'}
                                        </td>
                                        ${
                                            manager
                                                ? html`<td class="cell-actions">
                                                      ${
                                                          member.relationship === 'Responsável'
                                                              ? html`<span class="text-muted text-small"
                                                                    >Edite em “Editar”</span
                                                                >`
                                                              : html` <button
                                                                        type="button"
                                                                        class="btn btn-sm"
                                                                        data-action="member-edit"
                                                                        data-family-id="${family.id}"
                                                                        data-member-id="${member.id}"
                                                                        data-name="${member.fullName}"
                                                                        data-relationship="${member.relationship}"
                                                                        data-birth="${member.birthDate ?? ''}"
                                                                        aria-label="Editar ${member.fullName}"
                                                                        title="Editar integrante"
                                                                    >
                                                                        ${icon('pencil')}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        class="btn btn-sm btn-danger"
                                                                        data-action="member-remove"
                                                                        data-family-id="${family.id}"
                                                                        data-member-id="${member.id}"
                                                                        data-name="${member.fullName}"
                                                                        aria-label="Remover ${member.fullName}"
                                                                        title="Remover integrante"
                                                                    >
                                                                        ${icon('trash-2')}
                                                                    </button>`
                                                      }
                                                  </td>`
                                                : ''
                                        }
                                    </tr>`
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <div class="split-even">
                <section class="card" aria-labelledby="visitas-title">
                    <div class="card-header"><h2 id="visitas-title">Visitas</h2></div>
                    ${
                        family.visits.length
                            ? html`<ul class="list-rows">
                                  ${family.visits.map(
                                      (visit) =>
                                          html`<li>
                                              <div class="grow">
                                                  <a class="row-link" href="#/agenda/${encodeURIComponent(visit.id)}"
                                                      >${formatDateTime(visit.scheduledAt)}</a
                                                  >
                                                  <span class="text-muted text-small"
                                                      >${visit.volunteerName ?? 'Sem responsável'}</span
                                                  >
                                              </div>
                                              ${badge('visitStatus', visit.status)}
                                          </li>`
                                  )}
                              </ul>`
                            : emptyState({
                                  iconName: 'calendar-days',
                                  title: 'Nenhuma visita',
                                  text: 'Ainda não há visitas para esta família.',
                              })
                    }
                </section>
                <section class="card" aria-labelledby="needs-title">
                    <div class="card-header"><h2 id="needs-title">Necessidades</h2></div>
                    ${
                        family.needs.length
                            ? html`<ul class="list-rows">
                                  ${family.needs.map(
                                      (need) =>
                                          html`<li>
                                              <div class="grow">
                                                  <span class="text-strong">${need.category}</span>
                                                  <span class="text-muted text-small">${need.description}</span
                                                  ><span class="text-muted text-small"
                                                      >${need.referrals.length} encaminhamento(s)</span
                                                  >
                                              </div>
                                              ${badge('priority', need.priority)}${badge('needStatus', need.status)}
                                          </li>`
                                  )}
                              </ul>`
                            : emptyState({
                                  iconName: 'clipboard-list',
                                  title: 'Nenhuma necessidade',
                                  text: 'Nenhuma necessidade registrada.',
                              })
                    }
                </section>
            </div>

            ${
                manager
                    ? html`<section class="card" aria-labelledby="hist-title">
                          <div class="card-header">
                              <h2 id="hist-title">Histórico de alterações</h2>
                              <button
                                  type="button"
                                  class="btn btn-sm"
                                  data-action="load-history"
                                  data-family-id="${family.id}"
                              >
                                  ${icon('history')}Carregar histórico
                              </button>
                          </div>
                          <div id="history-box" class="card-body text-muted">
                              O histórico registra quem alterou cada informação, quando e qual era o valor anterior.
                          </div>
                      </section>`
                    : ''
            }
        </div>`;
}

const goToFilters = (form) => {
    const data = new FormData(form);
    navigate('/familias', { search: data.get('search'), status: data.get('status') }, { replace: true, silent: true });
};
const applySearch = debounce((input) => goToFilters(input.form), SEARCH_DEBOUNCE_MS);

registerInputs({ 'family-search': (input) => applySearch(input) });
registerChanges({ 'family-filter-change': (select) => goToFilters(select.form) });
registerForms({ 'family-filters': (form) => goToFilters(form) });

registerActions({
    async 'load-history'(button) {
        const box = document.getElementById('history-box');
        await withLoading(button, async () => {
            const { data } = await api.get(`/families/${encodeURIComponent(button.dataset.familyId)}/history`, {
                limit: 50,
            });
            box.className = 'table-wrap';
            box.innerHTML = html`<table class="data">
                <caption class="sr-only">
                    Histórico de alterações
                </caption>
                <thead>
                    <tr>
                        <th scope="col">Quando</th>
                        <th scope="col">Quem</th>
                        <th scope="col">O que mudou</th>
                        <th scope="col">De</th>
                        <th scope="col">Para</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(
                        (entry) =>
                            html`<tr>
                                <td data-l="Quando">${formatDateTime(entry.createdAt)}</td>
                                <td data-l="Quem">${entry.userName ?? '—'}</td>
                                <td data-l="O que mudou">${entry.field ?? entry.action}</td>
                                <td data-l="De">${entry.oldValue ?? '—'}</td>
                                <td data-l="Para">${entry.newValue ?? '—'}</td>
                            </tr>`
                    )}
                </tbody>
            </table>`.value;
        });
    },
});
