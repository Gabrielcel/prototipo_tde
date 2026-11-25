import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, buildCsv } from '../../src/utils/csv.js';
import {
    parseBirthDate,
    parseDateOnly,
    parseEmail,
    parseInstant,
    parsePhone,
    parsePostalCode,
    parsePersonName,
    isUuid,
} from '../../src/utils/validators.js';
import { parsePagination } from '../../src/utils/pagination.js';
import { dateInTimezone } from '../../src/utils/dates.js';
import { normalizeError } from '../../src/utils/errors.js';

describe('validadores', () => {
    test('telefone brasileiro é normalizado', () => {
        assert.equal(parsePhone('88999990001'), '(88) 99999-0001');
        assert.equal(parsePhone('+55 (88) 3333-4444'), '(88) 3333-4444');
        assert.throws(() => parsePhone('1234'));
        assert.throws(() => parsePhone('(88) 89999-0001'));
    });
    test('CEP, e-mail e nome', () => {
        assert.equal(parsePostalCode('63180000'), '63180-000');
        assert.throws(() => parsePostalCode('6318'));
        assert.equal(parseEmail(' Ana@Example.ORG '), 'ana@example.org');
        assert.throws(() => parseEmail('ana@'));
        assert.equal(parsePersonName('  José   da Silva-Neto  ', 'Nome'), 'José da Silva-Neto');
        assert.throws(() => parsePersonName('<b>x</b>', 'Nome'));
        assert.throws(() => parsePersonName('A', 'Nome'));
    });
    test('datas reais, nascimento não futuro', () => {
        assert.equal(parseDateOnly('2024-02-29', 'Data'), '2024-02-29');
        assert.throws(() => parseDateOnly('2023-02-29', 'Data'));
        assert.throws(() => parseDateOnly('2023-13-01', 'Data'));
        assert.throws(() => parseBirthDate('2999-01-01'));
        assert.throws(() => parseBirthDate('1800-01-01'));
        assert.equal(parseBirthDate(''), null);
        assert.throws(() => parseBirthDate('', { required: true }));
    });
    test('instantes exigem fuso horário e normalizam para UTC', () => {
        assert.equal(parseInstant('2030-05-01T10:00:00-03:00'), '2030-05-01T13:00:00.000Z');
        assert.throws(() => parseInstant('2030-05-01T10:00:00'));
        assert.throws(() => parseInstant('2000-05-01T10:00:00Z', { future: true }));
    });
    test('uuid e paginação', () => {
        assert.ok(isUuid('8ef69a94-ca72-40e4-af66-fcad78d3facd'));
        assert.ok(!isUuid("1' OR '1'='1"));
        assert.deepEqual(parsePagination({ page: '2', limit: '10' }), { page: 2, limit: 10, offset: 10 });
        assert.throws(() => parsePagination({ limit: '1000' }));
    });
});

describe('CSV', () => {
    test('protege contra fórmulas e escapa aspas, separadores e quebras de linha', () => {
        assert.equal(csvCell('=1+1'), "'=1+1");
        assert.equal(csvCell('+55'), "'+55");
        assert.equal(csvCell('-2'), "'-2");
        assert.equal(csvCell('@SOMA(A1)'), "'@SOMA(A1)");
        assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
        assert.equal(csvCell('a;b'), '"a;b"');
        assert.equal(csvCell('linha1\nlinha2'), 'linha1 linha2');
        assert.equal(csvCell(null), '');
        assert.equal(csvCell('Normal'), 'Normal');
    });
    test('usa BOM, ponto e vírgula e CRLF', () => {
        const csv = buildCsv(['A', 'B'], [['1', 'x;y']]);
        assert.equal(csv, '\uFEFFA;B\r\n1;"x;y"\r\n');
    });
});

describe('datas e fuso horário', () => {
    test('a data é calculada no fuso oficial, não no UTC', () => {
        const instant = new Date('2026-12-20T02:30:00Z');
        assert.equal(dateInTimezone(instant, 'America/Fortaleza'), '2026-12-19');
        assert.equal(dateInTimezone(instant, 'UTC'), '2026-12-20');
    });
});

describe('erros', () => {
    test('erros do banco viram respostas seguras', () => {
        assert.equal(normalizeError({ code: '23505' }).statusCode, 409);
        assert.equal(normalizeError({ code: '23P01' }).code, 'SCHEDULE_CONFLICT');
        assert.equal(normalizeError({ code: 'ECONNREFUSED' }).statusCode, 503);
        const unknown = normalizeError(new Error('SELECT secret FROM users'));
        assert.equal(unknown.statusCode, 500);
        assert.ok(!unknown.message.includes('SELECT'));
    });
});
