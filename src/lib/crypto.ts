import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
} from 'crypto';
import { promisify } from 'util';

import { env } from '@/config/env';
import { createLogger } from '@/utils/logger';

const logger = createLogger('crypto');
const scrypt = promisify(scryptCallback);

export class CryptoManager {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly ivLength = 12; // 96-bit nonce recommended for GCM
  private static readonly saltLength = 16;
  private static readonly keyLength = 32;
  private static readonly currentVersion = 'v2';

  private legacyKey: Buffer | null = null;

  private getLegacyKey(): Buffer {
    if (!this.legacyKey) {
      this.legacyKey = createHash('sha256').update(env.crypto.encryptionKey).digest();
    }

    return this.legacyKey;
  }

  private async deriveKey(salt: Buffer): Promise<Buffer> {
    const derived = (await scrypt(
      env.crypto.encryptionKey,
      salt,
      CryptoManager.keyLength,
    )) as Buffer;
    return derived;
  }

  async encryptPrivateKey(plainKey: string): Promise<string> {
    logger.debug('encryptPrivateKey invoked');

    if (!plainKey) {
      throw new Error('Plain key must be provided for encryption');
    }

    try {
      const iv = randomBytes(CryptoManager.ivLength);
      const salt = randomBytes(CryptoManager.saltLength);
      const key = await this.deriveKey(salt);

      const cipher = createCipheriv(CryptoManager.algorithm, key, iv);
      const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const segments = [
        CryptoManager.currentVersion,
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
      ];

      return segments.join('.');
    } catch (error: unknown) {
      logger.error('Failed to encrypt private key', error instanceof Error ? error : { error });
      throw new Error('Unable to encrypt private key');
    }
  }

  async decryptPrivateKey(encryptedKey: string): Promise<string> {
    logger.debug('decryptPrivateKey invoked');

    const parts = encryptedKey.split('.');

    try {
      if (parts[0] === CryptoManager.currentVersion) {
        if (parts.length !== 5) {
          throw new Error('Encrypted key is malformed');
        }

        const [, saltB64, ivB64, tagB64, cipherB64] = parts;
        if (!saltB64 || !ivB64 || !tagB64 || !cipherB64) {
          throw new Error('Encrypted key is malformed');
        }

        const salt = Buffer.from(saltB64, 'base64');
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(tagB64, 'base64');
        const cipherText = Buffer.from(cipherB64, 'base64');

        const key = await this.deriveKey(salt);
        const decipher = createDecipheriv(CryptoManager.algorithm, key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
        return decrypted.toString('utf8');
      }

      if (parts.length !== 3) {
        throw new Error('Encrypted key is malformed');
      }

      const [ivB64, tagB64, cipherB64] = parts;
      if (!ivB64 || !tagB64 || !cipherB64) {
        throw new Error('Encrypted key is malformed');
      }

      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(tagB64, 'base64');
      const cipherText = Buffer.from(cipherB64, 'base64');

      const decipher = createDecipheriv(CryptoManager.algorithm, this.getLegacyKey(), iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('Decryption failed');
      logger.error('Failed to decrypt private key', normalizedError);
      if (normalizedError.message === 'Encrypted key is malformed') {
        throw normalizedError;
      }
      throw new Error('Unable to decrypt private key');
    }
  }
}

export const cryptoManager = new CryptoManager();
