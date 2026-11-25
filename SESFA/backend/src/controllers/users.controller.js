import { badRequest } from '../utils/errors.js';
import { buildPagination, parsePagination } from '../utils/pagination.js';
import { sendData, sendList } from '../utils/responses.js';
import { USER_ROLES, USER_STATUSES } from '../utils/constants.js';
import { optionalEnum, parseSearch } from '../utils/filters.js';
import { parseEmail, parseEnum, parsePassword, parsePersonName, requireUuid } from '../utils/validators.js';
import * as users from '../services/users.service.js';

export async function list({ res, query }) {
    const pagination = parsePagination(query);
    const filters = {
        status: optionalEnum(query.status, USER_STATUSES, 'Situação'),
        role: optionalEnum(query.role, USER_ROLES, 'Perfil'),
        search: parseSearch(query),
    };
    const { items, total } = await users.listUsers(pagination, filters);
    sendList(res, items, buildPagination(pagination, total));
}

export async function directory({ res }) {
    sendData(res, 200, await users.userDirectory());
}

export async function create({ res, user, body, ip }) {
    const role = parseEnum(body.role ?? 'voluntario', USER_ROLES, 'Perfil');
    const account = {
        fullName: parsePersonName(body.fullName, 'Nome'),
        email: parseEmail(body.email, { required: true }),
        password: parsePassword(body.password, 'A senha inicial'),
        role,
    };
    sendData(res, 201, await users.createUser(user, account, ip));
}

export async function update({ res, user, params, body, ip }) {
    const id = requireUuid(params.id, 'usuário');
    const changes = {};
    if (body.fullName !== undefined) changes.fullName = parsePersonName(body.fullName, 'Nome');
    if (body.role !== undefined) changes.role = parseEnum(body.role, USER_ROLES, 'Perfil');
    if (!Object.keys(changes).length) throw badRequest('Informe ao menos um campo para atualizar.');
    sendData(res, 200, await users.updateUser(user, id, changes, ip));
}

export async function updateStatus({ res, user, params, body, ip }) {
    const id = requireUuid(params.id, 'usuário');
    const status = parseEnum(body.status, USER_STATUSES, 'Situação de acesso');
    sendData(res, 200, await users.updateUserStatus(user, id, status, ip));
}
