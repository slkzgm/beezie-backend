import type { Context } from 'hono';

import type { AppEnv } from '@/types/app';
import type { TransferInput } from '@/schemas/wallet.schema';
import { createLogger } from '@/utils/logger';
import { walletService, WalletError } from '@/services/wallet.service';

const logger = createLogger('wallet-controller');

export class WalletController {
  async transfer(ctx: Context<AppEnv>, payload: TransferInput) {
    logger.info('Requested USDC transfer', {
      destinationAddress: payload.destinationAddress,
      userId: ctx.get('userId'),
    });

    try {
      const db = ctx.get('db');
      const idempotencyKey = ctx.req.header('Idempotency-Key') ?? undefined;
      const result = await walletService.transferUsdc(
        db,
        payload,
        ctx.get('userId'),
        idempotencyKey,
      );

      if (result.status === 'pending') {
        return ctx.json(
          {
            message: 'Transfer already in progress',
          },
          202,
        );
      }

      return ctx.json(
        {
          message: 'Transfer initiated',
          transactionHash: result.transactionHash,
        },
        202,
      );
    } catch (error: unknown) {
      logger.error('USDC transfer failed', error instanceof Error ? error : { error });
      const status = error instanceof WalletError ? error.status : 500;
      ctx.status(status);
      return ctx.json({
        message: error instanceof Error ? error.message : 'Unable to process transfer',
      });
    }
  }
}

export const walletController = new WalletController();
