import { html, raw } from '../utils/dom.js';

const REQUIRED_ATTR = raw('required aria-required="true"');

const slug = (name) => `f-${name.replace(/[^a-z0-9]+/gi, '-')}`;

/** Id do elemento de um campo (os nomes são normalizados: m_name_0 → f-m-name-0). */
export const fieldId = slug;

function describedBy(id, hint) {
    return `${hint ? `${id}-hint ` : ''}${id}-error`;
}

export function fieldShell({ id, label, required, hint, control, className = '' }) {
    return html`<div class="field ${className}">
        <label for="${id}"
            >${label}${required ? html`<span class="required-mark" aria-hidden="true">*</span>` : ''}</label
        >
        ${control} ${hint ? html`<span class="hint" id="${id}-hint">${hint}</span>` : ''}
        <span class="field-error" id="${id}-error" aria-live="polite"></span>
    </div>`;
}

export function inputField({
    name,
    label,
    type = 'text',
    value = '',
    required = false,
    hint = '',
    autocomplete = 'off',
    inputmode = '',
    maxlength = 200,
    placeholder = '',
    className = '',
    min = '',
    max = '',
    mask = '',
    disabled = false,
}) {
    const id = slug(name);
    return fieldShell({
        id,
        label,
        required,
        hint,
        className,
        control: html`<input
            class="input"
            id="${id}"
            name="${name}"
            type="${type}"
            value="${value ?? ''}"
            autocomplete="${autocomplete}"
            ${inputmode ? html`inputmode="${inputmode}"` : ''}
            maxlength="${maxlength}"
            ${placeholder ? html`placeholder="${placeholder}"` : ''}
            ${min ? html`min="${min}"` : ''}
            ${max ? html`max="${max}"` : ''}
            ${mask ? html`data-input="mask-${mask}"` : ''}
            ${required ? REQUIRED_ATTR : ''}
            ${disabled ? 'disabled' : ''}
            aria-describedby="${describedBy(id, hint)}"
        />`,
    });
}

export function selectField({
    name,
    label,
    options,
    value = '',
    required = false,
    hint = '',
    emptyLabel = '',
    className = '',
    disabled = false,
    change = '',
}) {
    const id = slug(name);
    return fieldShell({
        id,
        label,
        required,
        hint,
        className,
        control: html`<select
            class="select"
            id="${id}"
            name="${name}"
            ${required ? REQUIRED_ATTR : ''}
            ${disabled ? 'disabled' : ''}
            ${change ? html`data-change="${change}"` : ''}
            aria-describedby="${describedBy(id, hint)}"
        >
            ${
                emptyLabel !== null && emptyLabel !== undefined && emptyLabel !== false
                    ? html`<option value="">${emptyLabel}</option>`
                    : ''
            }
            ${options.map((option) => html`<option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>`)}
        </select>`,
    });
}

export function textareaField({
    name,
    label,
    value = '',
    required = false,
    hint = '',
    maxlength = 2000,
    rows = 3,
    className = '',
}) {
    const id = slug(name);
    return fieldShell({
        id,
        label,
        required,
        hint,
        className,
        control: html`<textarea
            class="textarea"
            id="${id}"
            name="${name}"
            rows="${rows}"
            maxlength="${maxlength}"
            ${required ? REQUIRED_ATTR : ''}
            aria-describedby="${describedBy(id, hint)}"
        >
${value ?? ''}</textarea>`,
    });
}

export function choiceGroup({ name, label, options, value = '', required = false }) {
    const id = slug(name);
    return html`<fieldset class="field" aria-describedby="${id}-error">
        <legend>${label}${required ? html`<span class="required-mark" aria-hidden="true">*</span>` : ''}</legend>
        <div class="choice-group">
            ${options.map(
                (option) =>
                    html`<label class="choice">
                        <input
                            type="radio"
                            name="${name}"
                            value="${option.value}"
                            ${String(option.value) === String(value) ? 'checked' : ''}
                            ${required ? 'required' : ''}
                        />
                        <span>${option.label}</span>
                    </label>`
            )}
        </div>
        <span class="field-error" id="${id}-error" aria-live="polite"></span>
    </fieldset>`;
}

export function readForm(form) {
    const data = {};
    for (const [key, value] of new FormData(form)) data[key] = typeof value === 'string' ? value.trim() : value;
    return data;
}

export function clearFormErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach((element) => {
        element.textContent = '';
    });
    const summary = form.querySelector('[data-form-error]');
    if (summary) {
        summary.hidden = true;
        summary.textContent = '';
    }
}

export function setFieldError(form, name, message) {
    const control = form.elements[name];
    const first = control instanceof RadioNodeList ? control[0] : control;
    if (!first) return;
    first.setAttribute('aria-invalid', 'true');
    const error = form.querySelector(`#${slug(name)}-error`);
    if (error) error.textContent = message;
}

/** Mensagem geral do formulário (erros vindos do servidor). */
export function showFormError(form, message) {
    const summary = form.querySelector('[data-form-error]');
    if (!summary) return;
    summary.hidden = false;
    summary.textContent = message;
    summary.focus();
}

export function focusFirstInvalid(form) {
    const invalid = form.querySelector('[aria-invalid="true"]');
    invalid?.focus();
    invalid?.scrollIntoView?.({ block: 'center' });
}

export const formErrorRegion = () =>
    html`<div class="alert alert-danger" data-form-error role="alert" tabindex="-1" hidden></div>`;

/** Formulário dentro de janela modal: corpo rolável + rodapé com ações. */
export function modalForm({
    name,
    ref = '',
    ref2 = '',
    body,
    submitLabel = 'Salvar',
    cancelLabel = 'Cancelar',
    danger = false,
}) {
    return html`<form class="modal-form" data-form="${name}" data-ref="${ref}" data-ref2="${ref2}" novalidate>
        <div class="modal-body">${formErrorRegion()}${body}</div>
        <div class="modal-footer">
            <button type="button" class="btn" data-action="modal-close">${cancelLabel}</button>
            <button type="submit" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}">${submitLabel}</button>
        </div>
    </form>`;
}

/** Envio padrão: limpa erros, mostra carregamento e exibe falhas do servidor no próprio formulário. */
export async function handleSubmit(form, task) {
    clearFormErrors(form);
    const button = form.querySelector('[type="submit"]');
    if (button?.getAttribute('aria-busy') === 'true') return;
    button?.setAttribute('aria-busy', 'true');
    if (button) button.disabled = true;
    try {
        await task();
    } catch (error) {
        showFormError(form, error?.message ?? 'Não foi possível concluir a operação.');
    } finally {
        button?.removeAttribute('aria-busy');
        if (button) button.disabled = false;
    }
}
