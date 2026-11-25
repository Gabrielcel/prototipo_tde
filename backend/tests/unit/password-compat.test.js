import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

process.env.SCRYPT_N = '16384';
const { hashPassword, verifyPassword } = await import('../../src/services/auth.service.js');
const scrypt = promisify(scryptCallback);

test('aceita hashes gerados pela versão original (scrypt N=131072)', async () => {
    const salt = randomBytes(16);
    const key = await scrypt('Senha-Original-1', salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
    const legacy = `scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
    assert.equal(await verifyPassword('Senha-Original-1', legacy), true);
    assert.equal(await verifyPassword('outra-senha-123', legacy), false);
});

test('hashes novos usam o mesmo formato e rejeitam hashes malformados', async () => {
    const hash = await hashPassword('Nova-Senha-123');
    assert.match(hash, /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(await verifyPassword('Nova-Senha-123', hash), true);
    for (const bad of ['', 'texto', 'scrypt$1$8$1$aa$bb', 'bcrypt$10$x$y$z$w']) {
        assert.equal(await verifyPassword('qualquer-coisa', bad), false);
    }
});
