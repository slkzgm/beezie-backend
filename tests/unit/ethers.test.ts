import { describe, expect, test } from 'bun:test';

import '../setup';

import { FetchResponse } from 'ethers';

import {
  ResilientJsonRpcProvider,
  createResilientProviderOptions,
} from '@/lib/ethers';

describe('ResilientJsonRpcProvider', () => {
  test('configures timeout, retries, and retryable responses', async () => {
    const options = createResilientProviderOptions();
    const provider = new ResilientJsonRpcProvider('http://localhost:8545', options);
    const connection = (provider as unknown as { _getConnection: () => unknown })._getConnection();

    if (!(connection instanceof Object) || typeof connection !== 'object') {
      throw new Error('Expected FetchRequest instance');
    }

    const request = connection as unknown as {
      timeout: number;
      processFunc?: (req: unknown, response: FetchResponse) => Promise<FetchResponse>;
      retryFunc?: (req: unknown, response: FetchResponse, attempt: number) => Promise<boolean>;
    };

    expect(request.timeout).toBe(options.requestTimeoutMs);

    if (!request.processFunc) {
      throw new Error('processFunc not configured');
    }

    const retryableResponse = new FetchResponse(
      503,
      'Service Unavailable',
      {},
      null,
      connection as never,
    );

    await expect(request.processFunc(connection, retryableResponse)).rejects.toMatchObject({
      throttle: true,
    });

    const nonRetryableResponse = new FetchResponse(404, 'Not Found', {}, null, connection as never);
    await expect(request.processFunc(connection, nonRetryableResponse)).resolves.toBe(
      nonRetryableResponse,
    );

    if (!request.retryFunc) {
      throw new Error('retryFunc not configured');
    }

    const allowRetry = await request.retryFunc(connection, retryableResponse, 0);
    expect(allowRetry).toBe(true);

    const denyRetry = await request.retryFunc(
      connection,
      retryableResponse,
      options.maxAttempts - 1,
    );
    expect(denyRetry).toBe(false);
  });
});
