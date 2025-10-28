import { describe, expect, test } from 'bun:test';

import '../setup';

const getCryptoManager = async () => {
  const mod = await import('@/lib/crypto');
  return mod.cryptoManager;
};

describe('cryptoManager', () => {
  test('encrypts and decrypts private keys symmetrically', async () => {
    const cryptoManager = await getCryptoManager();
    const secret = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const encrypted = await cryptoManager.encryptPrivateKey(secret);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(secret);

    const decrypted = await cryptoManager.decryptPrivateKey(encrypted);
    expect(decrypted).toBe(secret);
  });

  test('throws when encrypting empty keys', async () => {
    const cryptoManager = await getCryptoManager();
    expect(() => cryptoManager.encryptPrivateKey('')).toThrow(
      'Plain key must be provided for encryption',
    );
  });

  test('throws when decrypt payload malformed', async () => {
    const cryptoManager = await getCryptoManager();
    expect(() => cryptoManager.decryptPrivateKey('invalid-payload')).toThrow(
      'Encrypted key is malformed',
    );
  });
});
