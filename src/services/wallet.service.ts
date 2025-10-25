import type { TransferInput } from '@/schemas/wallet.schema';
import { createLogger } from '@/utils/logger';

const logger = createLogger('wallet-service');

export class WalletService {
  transferUsdc(payload: TransferInput, userId?: string): Promise<never> {
    logger.debug('transferUsdc invoked', {
      destinationAddress: payload.destinationAddress,
      userId,
    });
    // TODO: implement token transfer via TypeChain generated client.
    return Promise.reject(new Error('transferUsdc not implemented'));
  }
}

export const walletService = new WalletService();
