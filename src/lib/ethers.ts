import {
  FetchRequest,
  JsonRpcProvider,
  type FetchResponse,
  type Signer,
  Wallet,
  isHexString,
} from 'ethers';

import { env } from '@/config/env';
import { createLogger } from '@/utils/logger';
import { FlowUSDC__factory } from '../../typechain';

const logger = createLogger('ethers');

export type ResilientProviderOptions = {
  requestTimeoutMs: number;
  maxAttempts: number;
  slotIntervalMs: number;
  retryableStatusCodes: ReadonlySet<number>;
};

const retryableStatusCodes = [408, 425, 500, 502, 503, 504, 522, 524, 598, 599] as const;

const createDefaultResilientOptions = (): ResilientProviderOptions => ({
  requestTimeoutMs: 10_000,
  maxAttempts: 4,
  slotIntervalMs: 250,
  retryableStatusCodes: new Set(retryableStatusCodes),
});

class ResilientJsonRpcProvider extends JsonRpcProvider {
  constructor(url: string, private readonly options: ResilientProviderOptions) {
    super(url);
  }

  private shouldRetry(statusCode: number) {
    if (statusCode >= 500 && statusCode < 600) {
      return true;
    }

    return this.options.retryableStatusCodes.has(statusCode);
  }

  private configureRetries(request: FetchRequest) {
    request.setThrottleParams({
      maxAttempts: this.options.maxAttempts,
      slotInterval: this.options.slotIntervalMs,
    });

    request.retryFunc = async (_req, response, attempt) => {
      const shouldRetry = attempt + 1 < this.options.maxAttempts;
      if (!shouldRetry) {
        logger.error('Flow RPC retry limit reached', {
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
        });
      } else {
        logger.warn('Flow RPC throttled request', {
          attempt: attempt + 1,
          statusCode: response.statusCode,
        });
      }
      return shouldRetry;
    };

    request.processFunc = async (req, response) => this.processResponse(req, response);
  }

  private async processResponse(request: FetchRequest, response: FetchResponse) {
    if (!response.ok() && this.shouldRetry(response.statusCode)) {
      logger.warn('Flow RPC response marked retryable', {
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        url: request.url,
      });
      response.throwThrottleError();
    }

    return response;
  }

  protected override _getConnection(): FetchRequest {
    const connection = super._getConnection();
    connection.timeout = this.options.requestTimeoutMs;
    this.configureRetries(connection);
    return connection;
  }
}

let provider: JsonRpcProvider | null = null;
let cachedUsdcDecimals: number | null = null;

const createJsonRpcProvider = (url: string): JsonRpcProvider =>
  new ResilientJsonRpcProvider(url, createDefaultResilientOptions());

const getProvider = (): JsonRpcProvider => {
  if (!provider) {
    logger.debug('Creating Flow EVM provider', { url: env.flow.accessApi });
    provider = createJsonRpcProvider(env.flow.accessApi);
  }

  return provider;
};

export const generateWallet = (mnemonicPhrase?: string) => {
  logger.debug('Generating wallet', { derived: Boolean(mnemonicPhrase) });
  if (mnemonicPhrase) {
    return Wallet.fromPhrase(mnemonicPhrase);
  }

  return Wallet.createRandom();
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

export { ResilientJsonRpcProvider };
export const createResilientProviderOptions = (): ResilientProviderOptions =>
  createDefaultResilientOptions();
