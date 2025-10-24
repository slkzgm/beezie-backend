import { createLogger } from "@/utils/logger";

const logger = createLogger("crypto");

export class CryptoManager {
  encryptPrivateKey(plainKey: string): Promise<string> {
    logger.debug("encryptPrivateKey invoked");
    // TODO: implement encryption strategy (e.g., AES-GCM with per-user salt).
    return Promise.resolve(plainKey);
  }

  decryptPrivateKey(encryptedKey: string): Promise<string> {
    logger.debug("decryptPrivateKey invoked");
    // TODO: implement decryption counterpart.
    return Promise.resolve(encryptedKey);
  }
}

export const cryptoManager = new CryptoManager();
