import { api } from '../../services/api.js';
import { getState } from '../../core/state.js';
import { loadDirectory } from '../../services/auth.js';
import { html, setHtml } from '../../utils/dom.js';
import { icon } from '../../components/icons.js';
import { emptyState, pageHeader, requiredNote } from '../../components/ui.js';
import {
    choiceGroup,
    focusFirstInvalid,
    formErrorRegion,
    handleSubmit,
    readForm,
    selectField,
    setFieldError,
    textareaField,
    clearFormErrors,
    fieldId,
} from '../../components/forms.js';
import { registerActions, registerForms } from '../../core/actions.js';
import { navigate, setTitle } from '../../core/router.js';
import { confirmDialog } from '../../components/modal.js';
import { toastSuccess } from '../../components/notification.js';
import { formatDateTime } from '../../utils/formatters.js';

let record = null;

const blankReferral = () => ({ type: 'encaminhamento', responsibleUserId: '', description: '' });
const blankNeed = () => ({ category: '', priority: 'media', description: '', referrals: [] });

function checklistSection() {
    const { meta } = getState();
    const options = meta.checklistAnswers.map((value) => ({ value, label: value }));
    return html`<section class="card record-step" aria-labelledby="rec-1">
        <div class="card-header">
            <h2 id="rec-1"><span class="step-number" aria-hidden="true">1</span>Checklist da visita</h2>
            <span class="text-muted text-small">Responda os ${meta.checklistItems.length} itens</span>
        </div>
        <div class="card-body">
            ${meta.checklistItems.map(
                (item, index) =>
                    html`<div class="checklist-item">
                        ${choiceGroup({ name: `c_${index}`, label: item, options, value: record.answers[index] ?? '', required: true })}
                    </div>`
            )}
        </div>
    </section>`;
}

function needsSection() {
    const { meta } = getState();
    const categories = meta.needCategories.map((value) => ({ value, label: value }));
    const priorities = [
        { value: 'alta', label: 'Alta' },
        { value: 'media', label: 'Média' },
        { value: 'baixa', label: 'Baixa' },
    ];
    const people = record.people.map((person) => ({
        value: person.id,
        label: `${person.fullName}${person.role === 'gestor' ? ' (gestor)' : ''}`,
    }));
    const types = [
        { value: 'encaminhamento', label: 'Encaminhamento' },
        { value: 'pendencia', label: 'Pendência' },
    ];
    return html`<section class="card record-step" aria-labelledby="rec-3">
        <div class="card-header">
            <h2 id="rec-3"><span class="step-number" aria-hidden="true">3</span>Necessidades e encaminhamentos</h2>
            <button type="button" class="btn btn-sm" data-action="rec-need-add">
                ${icon('plus')}Adicionar necessidade
            </button>
        </div>
        <div class="card-body stack-sm">
            ${record.needs.length ? '' : html`<p class="text-muted">Nenhuma necessidade identificada. Adicione se houver algo a acompanhar.</p>`}
            ${record.needs.map(
                (need, i) =>
                    html`<div class="need-draft">
                        <fieldset>
                            <legend class="text-strong">Necessidade ${i + 1}</legend>
                            <div class="form-grid">
                                ${selectField({ name: `n_cat_${i}`, label: 'Categoria', required: true, value: need.category, emptyLabel: 'Selecione', options: categories })}
                                ${selectField({ name: `n_pri_${i}`, label: 'Prioridade', value: need.priority, emptyLabel: null, options: priorities })}
                                ${textareaField({ name: `n_desc_${i}`, label: 'Descrição', required: true, value: need.description, rows: 2, className: 'span-all' })}
                            </div>
                            ${need.referrals.map(
                                (ref, j) =>
                                    html`<div class="referral-draft">
                                        <div class="form-grid">
                                            ${selectField({ name: `r_type_${i}_${j}`, label: 'Tipo', value: ref.type, emptyLabel: null, options: types })}
                                            ${selectField({ name: `r_resp_${i}_${j}`, label: 'Responsável', required: true, value: ref.responsibleUserId, emptyLabel: 'Selecione', options: people })}
                                            ${textareaField({ name: `r_desc_${i}_${j}`, label: 'Descrição do encaminhamento', value: ref.description, rows: 2, className: 'span-all' })}
                                        </div>
                                        <p>
                                            <button
                                                type="button"
                                                class="btn btn-sm btn-danger"
                                                data-action="rec-ref-remove"
                                                data-need="${i}"
                                                data-ref="${j}"
                                            >
                                                ${icon('trash-2')}Remover encaminhamento
                                            </button>
                                        </p>
                                    </div>`
                            )}
                            <div class="actions">
                                <button type="button" class="btn btn-sm" data-action="rec-ref-add" data-need="${i}">
                                    ${icon('plus')}Adicionar encaminhamento
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-danger"
                                    data-action="rec-need-remove"
                                    data-need="${i}"
                                >
                                    ${icon('trash-2')}Remover necessidade
                                </button>
                            </div>
                        </fieldset>
                    </div>`
            )}
        </div>
    </section>`;
}

function page() {
    const visit = record.visit;
    return html`${pageHeader({
            back: { href: `#/agenda/${encodeURIComponent(visit.id)}`, label: 'Voltar à visita' },
            title: 'Registro da visita',
            subtitle: `${visit.familyContact} (família ${visit.familyCode}) · ${formatDateTime(visit.scheduledAt)}`,
        })}
        <form class="stack" data-form="visit-record" novalidate>
            ${formErrorRegion()}${requiredNote()} ${checklistSection()}
            <section class="card record-step" aria-labelledby="rec-2">
                <div class="card-header">
                    <h2 id="rec-2"><span class="step-number" aria-hidden="true">2</span>Condições e observações</h2>
                </div>
                <div class="card-body stack-sm">
                    ${textareaField({ name: 'conditions', label: 'Condições observadas', value: record.conditions, maxlength: 4000, rows: 4 })}
                    ${textareaField({ name: 'observations', label: 'Observações gerais', value: record.observations, maxlength: 4000, rows: 4 })}
                </div>
            </section>
            ${needsSection()}
            <div class="sticky-actions">
                <a class="btn" href="#/agenda/${encodeURIComponent(visit.id)}">Cancelar</a>
                <button type="submit" class="btn btn-primary">${icon('check')}Concluir visita</button>
            </div>
        </form>`;
}

function redraw() {
    setHtml(document.getElementById('view'), page());
}

/** Copia o que está digitado para o estado, antes de redesenhar a página. */
function sync(form) {
    const data = readForm(form);
    const { meta } = getState();
    record.answers = meta.checklistItems.map((_, i) => data[`c_${i}`] ?? '');
    record.conditions = data.conditions ?? '';
    record.observations = data.observations ?? '';
    record.needs.forEach((need, i) => {
        need.category = data[`n_cat_${i}`] ?? '';
        need.priority = data[`n_pri_${i}`] ?? 'media';
        need.description = data[`n_desc_${i}`] ?? '';
        need.referrals.forEach((ref, j) => {
            ref.type = data[`r_type_${i}_${j}`] ?? 'encaminhamento';
            ref.responsibleUserId = data[`r_resp_${i}_${j}`] ?? '';
            ref.description = data[`r_desc_${i}_${j}`] ?? '';
        });
    });
}

export async function renderRecord({ params }) {
    const [{ data: visit }, people] = await Promise.all([
        api.get(`/visits/${encodeURIComponent(params.id)}`),
        loadDirectory(getState()),
    ]);
    setTitle(`Registro — ${visit.familyContact}`);
    const back = html`<a class="btn btn-primary" href="#/agenda/${encodeURIComponent(visit.id)}">Voltar à visita</a>`;
    if (visit.status === 'concluida' || visit.status === 'cancelada') {
        return emptyState({
            iconName: 'circle-check',
            title: visit.status === 'concluida' ? 'Esta visita já foi registrada' : 'Esta visita foi cancelada',
            text: 'Não é possível registrar novamente.',
            action: back,
        });
    }
    if (!visit.assignedTo) {
        return emptyState({
            iconName: 'user-round-check',
            title: 'Visita sem responsável',
            text: 'Atribua um responsável antes de registrar a visita.',
            action: back,
        });
    }
    record = { visit, people, answers: [], conditions: '', observations: '', needs: [] };
    return page();
}

registerActions({
    'rec-need-add'(button) {
        sync(button.form);
        record.needs.push(blankNeed());
        redraw();
        document.getElementById(fieldId(`n_cat_${record.needs.length - 1}`))?.focus();
    },
    'rec-need-remove'(button) {
        sync(button.form);
        record.needs.splice(Number(button.dataset.need), 1);
        redraw();
    },
    'rec-ref-add'(button) {
        sync(button.form);
        const need = record.needs[Number(button.dataset.need)];
        need.referrals.push(blankReferral());
        redraw();
        document.getElementById(fieldId(`r_resp_${button.dataset.need}_${need.referrals.length - 1}`))?.focus();
    },
    'rec-ref-remove'(button) {
        sync(button.form);
        record.needs[Number(button.dataset.need)].referrals.splice(Number(button.dataset.ref), 1);
        redraw();
    },
});

function validate(form) {
    clearFormErrors(form);
    const { meta } = getState();
    meta.checklistItems.forEach((_, i) => {
        if (!record.answers[i]) setFieldError(form, `c_${i}`, 'Responda este item.');
    });
    record.needs.forEach((need, i) => {
        if (!need.category) setFieldError(form, `n_cat_${i}`, 'Selecione a categoria.');
        if (!need.description) setFieldError(form, `n_desc_${i}`, 'Descreva a necessidade.');
        need.referrals.forEach((ref, j) => {
            if (!ref.responsibleUserId) setFieldError(form, `r_resp_${i}_${j}`, 'Escolha o responsável.');
        });
    });
    return !form.querySelector('[aria-invalid="true"]');
}

registerForms({
    'visit-record'(form) {
        sync(form);
        return handleSubmit(form, async () => {
            if (!validate(form)) return focusFirstInvalid(form);
            const ok = await confirmDialog({
                title: 'Concluir visita',
                confirmLabel: 'Concluir visita',
                message: 'Depois de concluída, o registro da visita não poderá ser alterado. Deseja concluir agora?',
            });
            if (!ok) return undefined;
            const { meta } = getState();
            await api.post(`/visits/${encodeURIComponent(record.visit.id)}/record`, {
                checklistAnswers: meta.checklistItems.map((item, i) => ({ item, answer: record.answers[i] })),
                conditions: record.conditions,
                observations: record.observations,
                needs: record.needs.map((need) => ({
                    category: need.category,
                    priority: need.priority,
                    description: need.description,
                    referrals: need.referrals.map((ref) => ({
                        type: ref.type,
                        responsibleUserId: ref.responsibleUserId,
                        description: ref.description,
                    })),
                })),
            });
            toastSuccess('Visita concluída e registrada.');
            return navigate(`/agenda/${record.visit.id}`);
        });
    },
});
