import { api } from '../../services/api.js';
import { getState } from '../../core/state.js';
import { html } from '../../utils/dom.js';
import { closeModal, confirmDialog, openModal } from '../../components/modal.js';
import {
    inputField,
    modalForm,
    readForm,
    selectField,
    handleSubmit,
    setFieldError,
    focusFirstInvalid,
} from '../../components/forms.js';
import { registerActions, registerForms } from '../../core/actions.js';
import { refreshRoute } from '../../core/router.js';
import { toastSuccess } from '../../components/notification.js';
import { isPersonName, isRealDate } from '../../utils/validators.js';
import { todayKey } from '../../utils/formatters.js';

const relationshipOptions = () =>
    getState()
        .meta.relationships.filter((value) => value !== 'Responsável')
        .map((value) => ({ value, label: value }));

function memberFields(member = {}) {
    return html`${inputField({ name: 'fullName', label: 'Nome completo', required: true, value: member.name ?? '', maxlength: 120 })}
    ${selectField({ name: 'relationship', label: 'Parentesco', required: true, value: member.relationship ?? '', emptyLabel: 'Selecione', options: relationshipOptions() })}
    ${inputField({ name: 'birthDate', label: 'Data de nascimento', type: 'date', value: member.birth ?? '', max: todayKey() })}`;
}

registerActions({
    'member-add'(button) {
        openModal({
            title: 'Adicionar integrante',
            body: modalForm({
                name: 'member-form',
                ref: button.dataset.familyId,
                body: memberFields(),
                submitLabel: 'Adicionar',
            }),
        });
    },
    'member-edit'(button) {
        openModal({
            title: 'Editar integrante',
            body: modalForm({
                name: 'member-form',
                ref: button.dataset.familyId,
                ref2: button.dataset.memberId,
                body: memberFields(button.dataset),
            }),
        });
    },
    async 'member-remove'(button) {
        const confirmed = await confirmDialog({
            title: 'Remover integrante',
            message: `${button.dataset.name} será removido(a) da composição familiar. A alteração fica registrada no histórico da família.`,
            confirmLabel: 'Remover integrante',
            danger: true,
        });
        if (!confirmed) return;
        await api.delete(
            `/families/${encodeURIComponent(button.dataset.familyId)}/members/${encodeURIComponent(button.dataset.memberId)}`
        );
        toastSuccess('Integrante removido.');
        refreshRoute({ silent: true });
    },
});

registerForms({
    'member-form'(form) {
        const { fullName, relationship, birthDate } = readForm(form);
        const familyId = form.dataset.ref;
        const memberId = form.dataset.ref2;
        return handleSubmit(form, async () => {
            if (!isPersonName(fullName)) setFieldError(form, 'fullName', 'Informe o nome do integrante.');
            if (!relationship) setFieldError(form, 'relationship', 'Selecione o parentesco.');
            if (birthDate && (!isRealDate(birthDate) || birthDate > todayKey()))
                setFieldError(form, 'birthDate', 'Informe uma data de nascimento válida.');
            if (form.querySelector('[aria-invalid="true"]')) return focusFirstInvalid(form);
            const body = { fullName, relationship, birthDate: birthDate || null };
            const base = `/families/${encodeURIComponent(familyId)}/members`;
            if (memberId) await api.patch(`${base}/${encodeURIComponent(memberId)}`, body);
            else await api.post(base, body);
            closeModal(form);
            toastSuccess(memberId ? 'Integrante atualizado.' : 'Integrante adicionado.');
            refreshRoute({ silent: true });
        });
    },
});
