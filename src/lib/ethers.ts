import { JsonRpcProvider, type Signer, Wallet, isHexString } from 'ethers';

import { env } from '@/config/env';
import { createLogger } from '@/utils/logger';
import { FlowUSDC__factory } from '../../typechain';

const logger = createLogger('ethers');

let provider: JsonRpcProvider | null = null;
let cachedUsdcDecimals: number | null = null;

const getProvider = (): JsonRpcProvider => {
  if (!provider) {
    logger.debug('Creating Flow EVM provider', { url: env.flow.accessApi });
    provider = new JsonRpcProvider(env.flow.accessApi);
  }

  return provider;
};

export const generateDeterministicWallet = (entropy?: string) => {
  logger.debug('Generating wallet from entropy');
  return entropy ? Wallet.fromPhrase(entropy) : Wallet.createRandom();
};

export const getWalletSigner = (privateKey: string): Signer => {
  const networkProvider = getProvider();
  return new Wallet(privateKey, networkProvider);
};

export const getUsdcContract = (signer: Signer) => {
  const address = env.flow.usdcContractAddress;

  if (!isHexString(address, 20)) {
    throw new Error('USDC contract address must be a 20-byte hex string');
  }

  logger.debug('Instantiating Flow USDC contract', { address });

  return FlowUSDC__factory.connect(address, signer);
};

export const getUsdcDecimals = async (): Promise<number> => {
  if (cachedUsdcDecimals !== null) {
    return cachedUsdcDecimals;
  }

  logger.debug('Fetching USDC decimals');
  const contract = FlowUSDC__factory.connect(env.flow.usdcContractAddress, getProvider());
  const decimalsValue = await contract.decimals();
  const decimals = Number(decimalsValue);

  if (!Number.isInteger(decimals)) {
    throw new Error('USDC decimals returned a non-integer value');
  }

  cachedUsdcDecimals = decimals;
  return decimals;
};
