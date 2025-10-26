import { describe, expect, test } from 'bun:test';

import '../setup';

const loadPasswordLib = async () => {
  return import('@/lib/password');
};

describe('password helpers', () => {
  test('hashPassword produces a non-reversible hash and verify succeeds', async () => {
    const { hashPassword, verifyPassword } = await loadPasswordLib();
    const plain = 'SuperSecurePassword123!';

    const hash = await hashPassword(plain);
    expect(typeof hash).toBe('string');
    expect(hash).not.toBe(plain);

    const validCheck = await verifyPassword(plain, hash);
    expect(validCheck).toBe(true);

    const invalidCheck = await verifyPassword('wrong', hash);
    expect(invalidCheck).toBe(false);
  });

  test('hashPassword rejects empty inputs', async () => {
    const { hashPassword } = await loadPasswordLib();
    return expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
  });
});
