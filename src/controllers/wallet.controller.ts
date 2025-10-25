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
      const result = await walletService.transferUsdc(db, payload, ctx.get('userId'));

      return ctx.json(
        {
          message: 'Transfer initiated',
          transactionHash: result.transactionHash,
        },
        202,
      );
    } catch (error) {
      logger.error('USDC transfer failed', error);
      const status = error instanceof WalletError ? error.status : 500;
      ctx.status(status);
      return ctx.json({
        message: error instanceof Error ? error.message : 'Unable to process transfer',
      });
    }
  }
}

export const walletController = new WalletController();
