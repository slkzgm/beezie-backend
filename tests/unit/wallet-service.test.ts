import { describe, expect, mock, test } from 'bun:test';

import '../setup';

import type { Signer } from 'ethers';
import type { Database } from '@/db/types';
import type { TransferInput } from '@/schemas/wallet.schema';
import {
  WalletService,
  WalletError,
  type WalletServiceDependencies,
} from '@/services/wallet.service';

const basePayload: TransferInput = {
  amount: '1.5',
  destinationAddress: '0x0000000000000000000000000000000000000002',
};

const mockDb = {} as unknown as Database;

const createService = (overrides: Partial<WalletServiceDependencies> = {}) => {
  const balanceMock = mock(() => Promise.resolve(2_000_000n));
  const transferMock = mock(() => Promise.resolve({ hash: '0xtxhash' }));

  const deps: WalletServiceDependencies = {
    findWalletByUserId: mock(() =>
      Promise.resolve({
        encryptedPrivateKey: 'encrypted',
        address: '0x0000000000000000000000000000000000000001',
      }),
    ),
    decryptPrivateKey: mock(() =>
      Promise.resolve('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
    ),
    getWalletSigner: mock(() => ({}) as unknown as Signer),
    getUsdcContract: mock(
      () =>
        ({
          balanceOf: balanceMock,
          transfer: transferMock,
        }) as unknown,
    ),
    getUsdcDecimals: mock(() => Promise.resolve(6)),
    ...overrides,
  };

  const service = new WalletService(deps);
  return { service, deps, balanceMock, transferMock };
};

describe('WalletService.transferUsdc', () => {
  test('broadcasts transfer and returns transaction hash', async () => {
    const { service, transferMock } = createService();

    const result = await service.transferUsdc(mockDb, basePayload, '1');

    expect(result.transactionHash).toBe('0xtxhash');
    expect(transferMock).toHaveBeenCalled();
  });

  test('throws when wallet not found', () => {
    const { service } = createService({
      findWalletByUserId: mock(() => Promise.resolve(null)),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toBeInstanceOf(WalletError);
  });

  test('throws when balance is insufficient', () => {
    const { service } = createService({
      getUsdcContract: mock(
        () =>
          ({
            balanceOf: mock(() => Promise.resolve(100n)),
            transfer: mock(() => Promise.resolve({ hash: '0x0' })),
          }) as unknown,
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Insufficient USDC balance');
  });

  test('wraps contract errors into wallet error', () => {
    const { service } = createService({
      getUsdcContract: mock(
        () =>
          ({
            balanceOf: mock(() => Promise.resolve(2_000_000n)),
            transfer: mock(() => Promise.reject(new Error('ERC20InvalidReceiver'))),
          }) as unknown,
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow(
      'Destination address is invalid for USDC transfers',
    );
  });

  test('rejects when userId missing', () => {
    const { service } = createService();

    const transferPromise = service.transferUsdc(mockDb, basePayload, undefined);
    return expect(transferPromise).rejects.toThrow('Unauthorized');
  });
});
