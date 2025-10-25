import { Wallet } from 'ethers';

import { createLogger } from '@/utils/logger';

const logger = createLogger('ethers');

export const generateDeterministicWallet = (entropy?: string) => {
  logger.debug('Generating wallet from entropy');
  return entropy ? Wallet.fromPhrase(entropy) : Wallet.createRandom();
};
