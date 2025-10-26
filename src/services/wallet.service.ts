import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { parseUnits } from 'ethers';

import type { Database } from '@/db/types';
import { wallets as walletsRepository } from '@/db/repositories';
import { cryptoManager } from '@/lib/crypto';
import { getWalletSigner, getUsdcContract, getUsdcDecimals } from '@/lib/ethers';
import type { TransferInput } from '@/schemas/wallet.schema';
import { createLogger } from '@/utils/logger';

const logger = createLogger('wallet-service');

export class WalletError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(message: string, status: ContentfulStatusCode) {
    super(message);
    this.name = 'WalletError';
    this.status = status;
  }
}

type TransferResult = {
  transactionHash: string;
};

export type WalletServiceDependencies = {
  findWalletByUserId: typeof walletsRepository.findWalletByUserId;
  decryptPrivateKey: (encryptedKey: string) => Promise<string>;
  getWalletSigner: typeof getWalletSigner;
  getUsdcContract: typeof getUsdcContract;
  getUsdcDecimals: typeof getUsdcDecimals;
};

const defaultDependencies: WalletServiceDependencies = {
  findWalletByUserId: walletsRepository.findWalletByUserId,
  decryptPrivateKey: (encryptedKey) => cryptoManager.decryptPrivateKey(encryptedKey),
  getWalletSigner,
  getUsdcContract,
  getUsdcDecimals,
};

export class WalletService {
  constructor(private readonly deps: WalletServiceDependencies = defaultDependencies) {}

  async transferUsdc(
    db: Database,
    payload: TransferInput,
    userId?: string,
  ): Promise<TransferResult> {
    logger.debug('transferUsdc invoked', {
      destinationAddress: payload.destinationAddress,
      userId,
    });

    if (!userId) {
      throw new WalletError('Unauthorized', 401);
    }

    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new WalletError('Invalid user identifier', 400);
    }

    const walletRecord = await this.deps.findWalletByUserId(db, numericUserId);

    if (!walletRecord) {
      throw new WalletError('Wallet not found for user', 404);
    }

    try {
      const decryptedPrivateKey = await this.deps.decryptPrivateKey(
        walletRecord.encryptedPrivateKey,
      );

      const signer = this.deps.getWalletSigner(decryptedPrivateKey);
      const usdcContract = this.deps.getUsdcContract(signer);
      const decimals = await this.deps.getUsdcDecimals();
      const amount = parseUnits(payload.amount, decimals);
      const balance = await usdcContract.balanceOf(walletRecord.address);

      if (balance < amount) {
        throw new WalletError('Insufficient USDC balance', 400);
      }

      const tx = await usdcContract.transfer(payload.destinationAddress, amount);

      logger.info('USDC transfer broadcast', {
        userId: numericUserId,
        destination: payload.destinationAddress,
        transactionHash: tx.hash,
      });

      return {
        transactionHash: tx.hash,
      };
    } catch (error: unknown) {
      logger.error('USDC transfer failed', error instanceof Error ? error : { error });
      if (error instanceof WalletError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.message.includes('ERC20InvalidReceiver')) {
          throw new WalletError('Destination address is invalid for USDC transfers', 400);
        }
      }

      throw new WalletError('Failed to transfer tokens', 500);
    }
  }
}

export const walletService = new WalletService();
