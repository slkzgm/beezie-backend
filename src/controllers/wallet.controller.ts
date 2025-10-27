import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '@/types/app';
import type { TransferInput } from '@/schemas/wallet.schema';
import { createLogger } from '@/utils/logger';
import { walletService, WalletError } from '@/services/wallet.service';
import { sendErrorResponse } from '@/utils/http';

const logger = createLogger('wallet-controller');

export class WalletController {
  async transfer(ctx: Context<AppEnv>, payload: TransferInput) {
    logger.info('Requested USDC transfer', {
      destinationAddress: payload.destinationAddress,
      userId: ctx.get('userId'),
    });

    try {
      const db = ctx.get('db');
      const incomingKey = ctx.req.header('Idempotency-Key');
      const normalizedKey = incomingKey?.trim() || undefined;

      if (!normalizedKey) {
        logger.warn('Missing Idempotency-Key header; duplicate transfers possible', {
          userId: ctx.get('userId'),
        });
        ctx.res.headers.set(
          'X-Idempotency-Warning',
          'Requests without Idempotency-Key may result in duplicate transfers',
        );
      } else {
        ctx.res.headers.set('Idempotency-Key', normalizedKey);
      }

      const result = await walletService.transferUsdc(
        db,
        payload,
        ctx.get('userId'),
        normalizedKey,
      );

      if (result.status === 'pending') {
        return ctx.json(
          {
            message: 'Transfer already in progress',
            idempotencyKey: normalizedKey ?? null,
          },
          202,
        );
      }

      return ctx.json(
        {
          message: 'Transfer initiated',
          transactionHash: result.transactionHash,
          idempotencyKey: normalizedKey ?? null,
        },
        202,
      );
    } catch (error: unknown) {
      const safeError = error instanceof Error ? error : new Error('Unknown wallet error');
      logger.error('USDC transfer failed', safeError);
      const status: ContentfulStatusCode =
        safeError instanceof WalletError ? safeError.status : 500;
      const code = safeError instanceof WalletError ? safeError.code : 'internal_error';
      const message = safeError.message ?? 'Unable to process transfer';
      return sendErrorResponse(ctx, status, code, message);
    }
  }
}

export const walletController = new WalletController();
