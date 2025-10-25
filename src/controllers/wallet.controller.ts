import type { Context } from 'hono';

import type { AppEnv } from '@/types/app';
import type { TransferInput } from '@/schemas/wallet.schema';
import { createLogger } from '@/utils/logger';
import { walletService } from '@/services/wallet.service';

const logger = createLogger('wallet-controller');

export class WalletController {
  async transfer(ctx: Context<AppEnv>, payload: TransferInput) {
    logger.info('Requested USDC transfer', {
      destinationAddress: payload.destinationAddress,
      userId: ctx.get('userId'),
    });

    try {
      await walletService.transferUsdc(payload, ctx.get('userId'));

      return ctx.json(
        {
          message: 'Transfer initiated',
        },
        202,
      );
    } catch (error) {
      logger.error('Transfer not implemented', error);
      return ctx.json(
        {
          message: 'Transfer not implemented yet',
        },
        501,
      );
    }
  }
}

export const walletController = new WalletController();
