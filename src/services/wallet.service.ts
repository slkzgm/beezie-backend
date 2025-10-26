import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { parseUnits } from 'ethers';

import type { Database } from '@/db/types';
import {
  wallets as walletsRepository,
  transferRequests as transferRequestsRepository,
  withTransaction,
} from '@/db/repositories';
import { cryptoManager } from '@/lib/crypto';
import { getWalletSigner, getUsdcContract, getUsdcDecimals } from '@/lib/ethers';
import type { TransferInput } from '@/schemas/wallet.schema';
import { createLogger } from '@/utils/logger';
import { sha256Hex } from '@/utils/hash';

const logger = createLogger('wallet-service');

export class WalletError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(message: string, status: ContentfulStatusCode) {
    super(message);
    this.name = 'WalletError';
    this.status = status;
  }
}

type TransferResult =
  | {
      status: 'completed';
      transactionHash: string;
    }
  | {
      status: 'pending';
    };

export type WalletServiceDependencies = {
  findWalletByUserId: typeof walletsRepository.findWalletByUserId;
  decryptPrivateKey: (encryptedKey: string) => Promise<string>;
  getWalletSigner: typeof getWalletSigner;
  getUsdcContract: typeof getUsdcContract;
  getUsdcDecimals: typeof getUsdcDecimals;
  findTransferRequest: typeof transferRequestsRepository.findByUserAndKeyHash;
  createTransferRequest: typeof transferRequestsRepository.createTransferRequest;
  updateTransferRequest: typeof transferRequestsRepository.updateTransferRequest;
};

const defaultDependencies: WalletServiceDependencies = {
  findWalletByUserId: walletsRepository.findWalletByUserId,
  decryptPrivateKey: (encryptedKey) => cryptoManager.decryptPrivateKey(encryptedKey),
  getWalletSigner,
  getUsdcContract,
  getUsdcDecimals,
  findTransferRequest: transferRequestsRepository.findByUserAndKeyHash,
  createTransferRequest: transferRequestsRepository.createTransferRequest,
  updateTransferRequest: transferRequestsRepository.updateTransferRequest,
}; 

export class WalletService {
  constructor(private readonly deps: WalletServiceDependencies = defaultDependencies) {}

  async transferUsdc(
    db: Database,
    payload: TransferInput,
    userId?: string,
    idempotencyKey?: string,
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

    const idempotencyKeyHash = idempotencyKey ? sha256Hex(idempotencyKey) : undefined;

    type ReservedTransferRequest = NonNullable<
      Awaited<ReturnType<WalletServiceDependencies['findTransferRequest']>>
    >;

    let reservation: ReservedTransferRequest | null = null;
    let reservationCreated = false;

    if (idempotencyKeyHash) {
      const reservationResult = await withTransaction(db, async (tx) => {
        const existing = await this.deps.findTransferRequest(tx, numericUserId, idempotencyKeyHash);
        if (existing) {
          this.ensureMatchingIdempotentPayload(existing, payload);
          return { record: existing, created: false } as const;
        }

        try {
          const created = await this.deps.createTransferRequest(tx, {
            userId: numericUserId,
            idempotencyKeyHash,
            amount: payload.amount,
            destinationAddress: payload.destinationAddress,
            status: 'pending',
            transactionHash: null,
          });

          if (!created) {
            throw new WalletError('Failed to reserve transfer request', 500);
          }

          return { record: created, created: true } as const;
        } catch (error) {
          if (this.isDuplicateEntryError(error)) {
            const concurrent = await this.deps.findTransferRequest(
              tx,
              numericUserId,
              idempotencyKeyHash,
            );
            if (!concurrent) {
              throw new WalletError('Failed to reserve transfer request', 500);
            }

            this.ensureMatchingIdempotentPayload(concurrent, payload);
            return { record: concurrent, created: false } as const;
          }

          throw error;
        }
      });

      reservation = reservationResult.record;
      reservationCreated = reservationResult.created;

      if (!reservationCreated) {
        if (reservation.status === 'completed' && reservation.transactionHash) {
          logger.info('Returning cached transfer result', {
            userId: numericUserId,
            transactionHash: reservation.transactionHash,
          });

          return { status: 'completed', transactionHash: reservation.transactionHash };
        }

        logger.info('Transfer already in progress for idempotency key', {
          userId: numericUserId,
        });

        return { status: 'pending' };
      }
    }

    try {
      const decryptedPrivateKey = await this.deps.decryptPrivateKey(
        walletRecord.encryptedPrivateKey,
      );

      const signer = this.deps.getWalletSigner(decryptedPrivateKey);
      const usdcContract = this.deps.getUsdcContract(signer);
      const decimals = await this.deps.getUsdcDecimals();
      const amount = parseUnits(payload.amount.toString(), decimals);
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

      if (idempotencyKeyHash && reservation) {
        await this.deps.updateTransferRequest(db, reservation.id, {
          transactionHash: tx.hash,
          status: 'completed',
        });
      }

      return {
        status: 'completed',
        transactionHash: tx.hash,
      };
    } catch (error: unknown) {
      logger.error('USDC transfer failed', error instanceof Error ? error : { error });
      if (error instanceof WalletError) {
        throw error;
      }

      throw this.mapContractError(error);
    }
  }

  private mapContractError(reason: unknown): WalletError {
    if (!(reason instanceof Error)) {
      return new WalletError('Failed to transfer tokens', 500);
    }

    const message = reason.message ?? '';
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('erc20invalidreceiver')) {
      return new WalletError('Destination address is invalid for USDC transfers', 400);
    }

    if (lowerMessage.includes('insufficientallowance')) {
      return new WalletError('Insufficient allowance for USDC transfer', 400);
    }

    if (lowerMessage.includes('caller is not the spender')) {
      return new WalletError('Caller must be approved to spend USDC', 400);
    }

    if (lowerMessage.includes('timeout') || lowerMessage.includes('network error')) {
      return new WalletError('Flow network timeout, please retry later', 504);
    }

    return new WalletError('Failed to transfer tokens', 500);
  }

  private ensureMatchingIdempotentPayload(
    existing: NonNullable<Awaited<ReturnType<WalletServiceDependencies['findTransferRequest']>>>,
    payload: TransferInput,
  ) {
    if (
      existing.amount !== payload.amount ||
      existing.destinationAddress.toLowerCase() !== payload.destinationAddress.toLowerCase()
    ) {
      throw new WalletError('Idempotency key already used with different payload', 409);
    }
  }

  private isDuplicateEntryError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const mysqlError = error as { code?: string; errno?: number };
    return mysqlError.code === 'ER_DUP_ENTRY' || mysqlError.errno === 1062;
  }
}

export const walletService = new WalletService();
