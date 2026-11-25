import { api } from '../../services/api.js';
import { getState } from '../../core/state.js';
import { html, raw, setHtml } from '../../utils/dom.js';

const CURRENT_STEP = raw('aria-current="step"');
import { icon } from '../../components/icons.js';
import { pageHeader, requiredNote } from '../../components/ui.js';
import {
    clearFormErrors,
    focusFirstInvalid,
    formErrorRegion,
    handleSubmit,
    inputField,
    readForm,
    selectField,
    setFieldError,
    fieldId,
} from '../../components/forms.js';
import { registerActions, registerForms } from '../../core/actions.js';
import { navigate, setTitle } from '../../core/router.js';
import { confirmDialog } from '../../components/modal.js';
import { toastSuccess } from '../../components/notification.js';
import { LABELS, formatDateOnly, todayKey } from '../../utils/formatters.js';
import { isEmail, isPersonName, isPhone, isPostalCode, isRealDate } from '../../utils/validators.js';

const STEPS = ['Responsável', 'Endereço', 'Integrantes', 'Revisão'];
let wizard = null;

const incomeOptions = () => Object.entries(LABELS.income).map(([value, text]) => ({ value, label: text }));
const statusOptions = () => Object.entries(LABELS.familyStatus).map(([value, text]) => ({ value, label: text }));

function stepper() {
    return html`<ol class="stepper" aria-label="Etapas do cadastro">
        ${STEPS.map(
            (name, index) =>
                html`<li class="${index < wizard.step ? 'done' : ''}" ${index === wizard.step ? CURRENT_STEP : ''}>
                    <span>${name}</span>
                </li>`
        )}
    </ol>`;
}

const responsibleFields = (v) =>
    html`<div class="form-grid">
        ${inputField({ name: 'contactName', label: 'Nome completo do responsável', required: true, value: v.contactName, maxlength: 120, autocomplete: 'name', className: 'span-all' })}
        ${inputField({ name: 'birthDate', label: 'Data de nascimento', type: 'date', required: true, value: v.birthDate, max: todayKey() })}
        ${inputField({ name: 'phone', label: 'Telefone com DDD', required: true, value: v.phone, mask: 'phone', inputmode: 'tel', autocomplete: 'tel', maxlength: 16, placeholder: '(88) 99999-0000' })}
        ${inputField({ name: 'email', label: 'E-mail', type: 'email', value: v.email, maxlength: 254, autocomplete: 'email' })}
        ${inputField({ name: 'occupation', label: 'Ocupação', value: v.occupation, maxlength: 100 })}
        ${selectField({ name: 'incomeRange', label: 'Renda familiar', value: v.incomeRange || 'nao_informado', emptyLabel: null, options: incomeOptions() })}
    </div>`;

const addressFields = (v) =>
    html`<div class="form-grid">
        ${inputField({ name: 'street', label: 'Rua e número', required: true, value: v.street, maxlength: 180, autocomplete: 'street-address', className: 'span-all' })}
        ${inputField({ name: 'neighborhood', label: 'Bairro', required: true, value: v.neighborhood, maxlength: 100 })}
        ${inputField({ name: 'city', label: 'Cidade', required: true, value: v.city, maxlength: 100, autocomplete: 'address-level2' })}
        ${inputField({ name: 'postalCode', label: 'CEP', value: v.postalCode, mask: 'cep', inputmode: 'numeric', maxlength: 9, autocomplete: 'postal-code', placeholder: '00000-000' })}
    </div>`;

function memberRows() {
    const relationships = getState()
        .meta.relationships.filter((value) => value !== 'Responsável')
        .map((value) => ({ value, label: value }));
    if (!wizard.members.length) {
        return html`<p class="text-muted">
            Nenhum integrante adicional. O responsável já é incluído automaticamente. Você pode adicionar os demais
            agora ou depois.
        </p>`;
    }
    return wizard.members.map(
        (member, index) =>
            html`<div class="member-row">
                ${inputField({ name: `m_name_${index}`, label: 'Nome', value: member.fullName, maxlength: 120 })}
                ${selectField({ name: `m_rel_${index}`, label: 'Parentesco', value: member.relationship, emptyLabel: null, options: relationships })}
                ${inputField({ name: `m_birth_${index}`, label: 'Nascimento', type: 'date', value: member.birthDate, max: todayKey() })}
                <button
                    type="button"
                    class="btn btn-danger btn-icon"
                    data-action="fam-member-remove"
                    data-index="${index}"
                    aria-label="Remover integrante ${index + 1}"
                >
                    ${icon('trash-2')}
                </button>
            </div>`
    );
}

function reviewList() {
    const v = wizard.values;
    const rows = [
        ['Responsável', v.contactName],
        ['Nascimento', formatDateOnly(v.birthDate)],
        ['Telefone', v.phone],
        ['E-mail', v.email || '—'],
        ['Ocupação', v.occupation || '—'],
        ['Renda familiar', LABELS.income[v.incomeRange]],
        ['Endereço', `${v.street}, ${v.neighborhood} — ${v.city}${v.postalCode ? `, CEP ${v.postalCode}` : ''}`],
        [
            'Integrantes',
            wizard.members.length
                ? wizard.members.map((m) => `${m.fullName} (${m.relationship})`).join('; ')
                : 'Somente o responsável',
        ],
    ];
    return html`<dl class="review-list">
        ${rows.map(
            ([term, value]) =>
                html`<div>
                    <dt>${term}</dt>
                    <dd>${value}</dd>
                </div>`
        )}
    </dl>`;
}

function stepBody() {
    const v = wizard.values;
    if (wizard.step === 0)
        return html`<section class="form-section">
            <h2>Dados do responsável</h2>
            <p class="hint">Quem responde pela família e será o contato principal.</p>
            ${responsibleFields(v)}
        </section>`;
    if (wizard.step === 1)
        return html`<section class="form-section">
            <h2>Endereço</h2>
            <p class="hint">Onde a família será visitada.</p>
            ${addressFields(v)}
        </section>`;
    if (wizard.step === 2) {
        return html`<section class="form-section">
            <h2>Integrantes da família</h2>
            <p class="hint">Adicione as demais pessoas que moram na casa.</p>
            ${memberRows()}
            <p>
                <button type="button" class="btn btn-sm" data-action="fam-member-add">
                    ${icon('plus')}Adicionar integrante
                </button>
            </p>
        </section>`;
    }
    return html`<section class="form-section">
        <h2>Revisão e consentimento</h2>
        <p class="hint">Confira os dados antes de salvar.</p>
        ${reviewList()}
        <div class="field consent-box">
            <label class="check"
                ><input
                    type="checkbox"
                    name="consentGiven"
                    value="yes"
                    ${wizard.consent ? 'checked' : ''}
                    required
                    aria-describedby="f-consentGiven-error"
                />
                <span
                    >Confirmo que a família foi informada sobre a finalidade da coleta dos dados e autorizou o registro
                    e o acompanhamento.<span class="required-mark" aria-hidden="true">*</span></span
                ></label
            >
            <span class="field-error" id="f-consentGiven-error" aria-live="polite"></span>
        </div>
    </section>`;
}

function renderWizard() {
    const last = wizard.step === STEPS.length - 1;
    return html`${pageHeader({ back: { href: '#/familias', label: 'Famílias' }, title: 'Nova família', subtitle: `Etapa ${wizard.step + 1} de ${STEPS.length}: ${STEPS[wizard.step]}` })}
        <div class="card">
            <form class="card-body" data-form="${last ? 'family-save' : 'family-next'}" novalidate>
                ${stepper()}${formErrorRegion()}${requiredNote()}${stepBody()}
                <div class="form-actions">
                    ${wizard.step > 0 ? html`<button type="button" class="btn" data-action="fam-prev">${icon('chevron-left')}Voltar</button>` : html`<a class="btn" href="#/familias">Cancelar</a>`}
                    <button type="submit" class="btn btn-primary">
                        ${last ? 'Salvar cadastro' : html`Continuar${icon('chevron-right')}`}
                    </button>
                </div>
            </form>
        </div>`;
}

const emptyValues = () => ({
    contactName: '',
    birthDate: '',
    phone: '',
    email: '',
    occupation: '',
    incomeRange: 'nao_informado',
    street: '',
    neighborhood: '',
    city: '',
    postalCode: '',
});

function redraw() {
    setHtml(document.getElementById('view'), renderWizard());
    window.scrollTo(0, 0);
    document.getElementById('page-title')?.focus({ preventScroll: true });
}

export async function renderForm({ params }) {
    if (params.id) return renderEdit(params.id);
    setTitle('Nova família');
    wizard = { mode: 'create', step: 0, values: emptyValues(), members: [], consent: false };
    return renderWizard();
}

async function renderEdit(id) {
    const { data: family } = await api.get(`/families/${encodeURIComponent(id)}`);
    setTitle(`Editar ${family.contactName}`);
    const v = {
        contactName: family.contactName,
        birthDate: family.birthDate ?? '',
        phone: family.phone,
        email: family.email ?? '',
        occupation: family.occupation ?? '',
        incomeRange: family.incomeRange,
        street: family.street,
        neighborhood: family.neighborhood,
        city: family.city,
        postalCode: family.postalCode ?? '',
    };
    wizard = { mode: 'edit', id };
    return html`${pageHeader({ back: { href: `#/familias/${encodeURIComponent(id)}`, label: 'Voltar à família' }, title: 'Editar família', subtitle: `Família ${family.code}. Os integrantes são gerenciados na página da família.` })}
        <div class="card">
            <form class="card-body" data-form="family-update" data-ref="${id}" novalidate>
                ${formErrorRegion()}${requiredNote()}
                <section class="form-section">
                    <h2>Dados do responsável</h2>
                    ${responsibleFields(v)}
                </section>
                <section class="form-section">
                    <h2>Endereço</h2>
                    ${addressFields(v)}
                </section>
                <section class="form-section">
                    <h2>Acompanhamento</h2>
                    <div class="form-grid">
                        ${selectField({ name: 'status', label: 'Situação', value: family.status, emptyLabel: null, options: statusOptions() })}
                    </div>
                </section>
                <div class="form-actions">
                    <a class="btn" href="#/familias/${encodeURIComponent(id)}">Cancelar</a
                    ><button type="submit" class="btn btn-primary">Salvar alterações</button>
                </div>
            </form>
        </div>`;
}

function validateStep(form, step) {
    const v = readForm(form);
    if (step === 0) {
        if (!isPersonName(v.contactName))
            setFieldError(form, 'contactName', 'Informe o nome completo (apenas letras).');
        if (!v.birthDate || !isRealDate(v.birthDate) || v.birthDate > todayKey())
            setFieldError(form, 'birthDate', 'Informe uma data de nascimento válida, que não seja futura.');
        if (!isPhone(v.phone)) setFieldError(form, 'phone', 'Informe o telefone com DDD.');
        if (v.email && !isEmail(v.email)) setFieldError(form, 'email', 'Informe um e-mail válido.');
    }
    if (step === 1) {
        if (!v.street) setFieldError(form, 'street', 'Informe a rua e o número.');
        if (!v.neighborhood) setFieldError(form, 'neighborhood', 'Informe o bairro.');
        if (!v.city) setFieldError(form, 'city', 'Informe a cidade.');
        if (v.postalCode && !isPostalCode(v.postalCode)) setFieldError(form, 'postalCode', 'O CEP deve ter 8 dígitos.');
    }
    return v;
}

function readMembers(form) {
    const data = readForm(form);
    return wizard.members.map((_, index) => ({
        fullName: data[`m_name_${index}`] ?? '',
        relationship: data[`m_rel_${index}`],
        birthDate: data[`m_birth_${index}`] ?? '',
    }));
}

function validateMembers(form) {
    const seen = new Set();
    wizard.members.forEach((member, index) => {
        if (!isPersonName(member.fullName)) setFieldError(form, `m_name_${index}`, 'Informe o nome.');
        else if (seen.has(member.fullName.toLowerCase()))
            setFieldError(form, `m_name_${index}`, 'Integrante repetido.');
        seen.add(member.fullName.toLowerCase());
        if (member.birthDate && (!isRealDate(member.birthDate) || member.birthDate > todayKey()))
            setFieldError(form, `m_birth_${index}`, 'Data inválida.');
    });
}

function payload() {
    const v = wizard.values;
    return {
        contactName: v.contactName,
        birthDate: v.birthDate,
        phone: v.phone,
        email: v.email || null,
        occupation: v.occupation || null,
        incomeRange: v.incomeRange,
        street: v.street,
        neighborhood: v.neighborhood,
        city: v.city,
        postalCode: v.postalCode || null,
        members: wizard.members.map((m) => ({ ...m, birthDate: m.birthDate || null })),
        consentGiven: true,
    };
}

async function confirmDuplicate(error) {
    const list = error.details.candidates.map(
        (c) =>
            html`<li class="duplicate-item">
                <strong>${c.contactName}</strong> — família ${c.code},
                ${c.neighborhood}${c.samePhone ? ' (mesmo telefone)' : ''}
            </li>`
    );
    return confirmDialog({
        title: 'Possível cadastro duplicado',
        message: 'Já existem famílias parecidas com esta. Confira se não é a mesma família antes de continuar.',
        extra: html`<ul class="stack-sm">
            ${list}
        </ul>`,
        confirmLabel: 'Cadastrar mesmo assim',
    });
}

registerActions({
    'fam-prev'(button) {
        wizard.members = wizard.step === 2 ? readMembers(button.form) : wizard.members;
        wizard.step -= 1;
        redraw();
    },
    'fam-member-add'(button) {
        wizard.members = readMembers(button.form);
        wizard.members.push({ fullName: '', relationship: 'Filho(a)', birthDate: '' });
        redraw();
        document.getElementById(fieldId(`m_name_${wizard.members.length - 1}`))?.focus();
    },
    'fam-member-remove'(button) {
        wizard.members = readMembers(button.form);
        wizard.members.splice(Number(button.dataset.index), 1);
        redraw();
    },
});

registerForms({
    'family-next'(form) {
        clearFormErrors(form);
        if (wizard.step === 2) {
            wizard.members = readMembers(form);
            validateMembers(form);
        } else {
            const values = validateStep(form, wizard.step);
            if (!form.querySelector('[aria-invalid="true"]')) Object.assign(wizard.values, values);
        }
        if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
        wizard.step += 1;
        redraw();
    },

    'family-save'(form) {
        return handleSubmit(form, async () => {
            wizard.consent = form.elements.consentGiven.checked;
            if (!wizard.consent) {
                setFieldError(form, 'consentGiven', 'Confirme o consentimento para salvar.');
                return focusFirstInvalid(form);
            }
            let confirmed = false;
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const { data } = await api.post('/families', { ...payload(), confirmDuplicate: confirmed });
                    toastSuccess(`Família ${data.code} cadastrada.`);
                    return navigate(`/familias/${data.id}`);
                } catch (error) {
                    if (error.code !== 'POSSIBLE_DUPLICATE' || confirmed) throw error;
                    if (!(await confirmDuplicate(error))) return undefined;
                    confirmed = true;
                }
            }
            return undefined;
        });
    },

    'family-update'(form) {
        return handleSubmit(form, async () => {
            const v = { ...validateStep(form, 0), ...validateStep(form, 1) };
            if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
            const body = {
                contactName: v.contactName,
                birthDate: v.birthDate,
                phone: v.phone,
                email: v.email || null,
                occupation: v.occupation || null,
                incomeRange: v.incomeRange,
                street: v.street,
                neighborhood: v.neighborhood,
                city: v.city,
                postalCode: v.postalCode || null,
                status: v.status,
            };
            let confirmed = false;
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    await api.patch(
                        `/families/${encodeURIComponent(form.dataset.ref)}`,
                        confirmed ? { ...body, confirmDuplicate: true } : body
                    );
                    toastSuccess('Alterações salvas.');
                    return navigate(`/familias/${form.dataset.ref}`);
                } catch (error) {
                    if (error.code !== 'POSSIBLE_DUPLICATE' || confirmed) throw error;
                    if (!(await confirmDuplicate(error))) return undefined;
                    confirmed = true;
                }
            }
            return undefined;
        });
    },
});
