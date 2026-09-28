// scrypt password hashing: the stored format, verification and the handling of
// malformed or foreign hashes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashPassword, verifyPassword } from '../../src/server/lib/password.js';

// A small cost keeps the tests fast; the format and the logic are identical.
const FAST = { N: 1024 };

test('a hash is self-describing and does not contain the password', () => {
  const hash = hashPassword('correct horse', FAST);
  const parts = hash.split('$');
  assert.equal(parts.length, 6);
  assert.equal(parts[0], 'scrypt');
  assert.equal(parts[1], '1024');
  assert.ok(!hash.includes('correct horse'));
});

test('the right password verifies and a wrong one does not', () => {
  const hash = hashPassword('correct horse', FAST);
  assert.equal(verifyPassword('correct horse', hash), true);
  assert.equal(verifyPassword('Correct horse', hash), false);
  assert.equal(verifyPassword('', hash), false);
});

test('hashing the same password twice yields different values (random salt)', () => {
  const first = hashPassword('same', FAST);
  const second = hashPassword('same', FAST);
  assert.notEqual(first, second);
  assert.equal(verifyPassword('same', first), true);
  assert.equal(verifyPassword('same', second), true);
});

test('the defaults produce a usable hash', () => {
  const hash = hashPassword('default params');
  assert.equal(verifyPassword('default params', hash), true);
  assert.equal(verifyPassword('other', hash), false);
});

test('a malformed or foreign hash is rejected without throwing', () => {
  const cases = [
    '',
    'not-a-hash',
    'scrypt$1024$8$1$only-five',
    'bcrypt$1024$8$1$c2FsdA$a2V5',
    'scrypt$0$8$1$c2FsdA$a2V5',
    'scrypt$1024$8$1$$',
    'scrypt$nan$8$1$c2FsdA$a2V5',
    null,
    undefined,
    42,
  ];
  for (const value of cases) {
    assert.equal(verifyPassword('whatever', value), false, `value: ${String(value)}`);
  }
});

test('a tampered key does not verify', () => {
  const hash = hashPassword('secret', FAST);
  const parts = hash.split('$');
  parts[5] = Buffer.from('tampered-key-value').toString('base64url');
  assert.equal(verifyPassword('secret', parts.join('$')), false);
});

test('non-string passwords are rejected', () => {
  const hash = hashPassword('secret', FAST);
  assert.equal(verifyPassword(123, hash), false);
  assert.equal(verifyPassword(null, hash), false);
});
