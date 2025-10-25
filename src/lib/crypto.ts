import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { env } from '@/config/env';
import { createLogger } from '@/utils/logger';

const logger = createLogger('crypto');

export class CryptoManager {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly ivLength = 12; // 96-bit nonce recommended for GCM

  private key: Buffer | null = null;

  private getKey(): Buffer {
    if (!this.key) {
      this.key = createHash('sha256').update(env.crypto.encryptionKey).digest();
    }

    return this.key;
  }

  encryptPrivateKey(plainKey: string): Promise<string> {
    logger.debug('encryptPrivateKey invoked');

    if (!plainKey) {
      throw new Error('Plain key must be provided for encryption');
    }

    return new Promise((resolve, reject) => {
      try {
        const iv = randomBytes(CryptoManager.ivLength);
        const cipher = createCipheriv(CryptoManager.algorithm, this.getKey(), iv);
        const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        const ivEncoded = Buffer.from(iv).toString('base64');
        const tagEncoded = Buffer.from(authTag).toString('base64');
        const cipherEncoded = Buffer.from(encrypted).toString('base64');

        resolve([ivEncoded, tagEncoded, cipherEncoded].join('.'));
      } catch (error) {
        logger.error('Failed to encrypt private key', error);
        reject(new Error('Unable to encrypt private key'));
      }
    });
  }

  decryptPrivateKey(encryptedKey: string): Promise<string> {
    logger.debug('decryptPrivateKey invoked');

    const parts = encryptedKey.split('.');
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

    return new Promise((resolve, reject) => {
      try {
        const decipher = createDecipheriv(CryptoManager.algorithm, this.getKey(), iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
        resolve(decrypted.toString('utf8'));
      } catch (error) {
        logger.error('Failed to decrypt private key', error);
        reject(new Error('Unable to decrypt private key'));
      }
    });
  }
}

export const cryptoManager = new CryptoManager();
