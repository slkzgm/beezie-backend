import { describe, expect, mock, test } from 'bun:test';

import '../setup';

import type { Signer } from 'ethers';
import type { Database } from '@/db/types';
import type { TransferRequest, Wallet } from '@/db/schema';
import type { TransferInput } from '@/schemas/wallet.schema';
import type { FlowUSDC } from '../../typechain/FlowUSDC';
import {
  WalletService,
  WalletError,
  type WalletServiceDependencies,
} from '@/services/wallet.service';

const basePayload: TransferInput = {
  amount: '1.5',
  destinationAddress: '0x0000000000000000000000000000000000000002',
};

const mockDb = {
  transaction: <T>(handler: (tx: Database) => Promise<T>) =>
    handler({} as unknown as Database),
} as unknown as Database;

const walletFixture: Wallet = {
  id: 1,
  userId: 1,
  address: '0x0000000000000000000000000000000000000001',
  encryptedPrivateKey: 'encrypted',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const makeContract = ({
  balanceOf,
  transfer,
}: {
  balanceOf: () => Promise<bigint>;
  transfer: () => Promise<{ hash: string }>;
}): FlowUSDC =>
  ({
    balanceOf: balanceOf as unknown,
    transfer: transfer as unknown,
  }) as FlowUSDC;

const createService = (overrides: Partial<WalletServiceDependencies> = {}) => {
  const balanceMock = mock(() => Promise.resolve(2_000_000n));
  const transferMock = mock(() => Promise.resolve({ hash: '0xtxhash' }));
  const findTransferRequestMock = mock<WalletServiceDependencies['findTransferRequest']>(() =>
    Promise.resolve(null),
  );
  const createTransferRequestMock = mock<WalletServiceDependencies['createTransferRequest']>(
    (_db, data) =>
      Promise.resolve({
        id: 1,
        userId: data.userId,
        idempotencyKeyHash: data.idempotencyKeyHash,
        amount: data.amount,
        destinationAddress: data.destinationAddress,
        transactionHash: data.transactionHash ?? null,
        status: (data.status ?? 'pending'),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
  );
  const updateTransferRequestMock = mock<WalletServiceDependencies['updateTransferRequest']>(() =>
    Promise.resolve(),
  );

  const baseDeps: WalletServiceDependencies = {
    findWalletByUserId: mock<WalletServiceDependencies['findWalletByUserId']>(() =>
      Promise.resolve(walletFixture),
    ),
    decryptPrivateKey: mock<WalletServiceDependencies['decryptPrivateKey']>(() =>
      Promise.resolve('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
    ),
    getWalletSigner: mock<WalletServiceDependencies['getWalletSigner']>(
      () => ({}) as unknown as Signer,
    ),
    getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
      makeContract({ balanceOf: balanceMock, transfer: transferMock }),
    ),
    getUsdcDecimals: mock<WalletServiceDependencies['getUsdcDecimals']>(() => Promise.resolve(6)),
    findTransferRequest: findTransferRequestMock,
    createTransferRequest: createTransferRequestMock,
    updateTransferRequest: updateTransferRequestMock,
  };

  const deps: WalletServiceDependencies = { ...baseDeps, ...overrides };

  const service = new WalletService(deps);
  return {
    service,
    deps,
    balanceMock,
    transferMock,
    findTransferRequestMock,
    createTransferRequestMock,
    updateTransferRequestMock,
  };
};

describe('WalletService.transferUsdc', () => {
  test('broadcasts transfer and returns transaction hash', async () => {
    const { service, transferMock, createTransferRequestMock } = createService();

    const result = await service.transferUsdc(mockDb, basePayload, '1');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') {
      throw new Error('Expected completed transfer');
    }
    expect(result.transactionHash).toBe('0xtxhash');
    expect(transferMock).toHaveBeenCalled();
    expect(createTransferRequestMock.mock.calls.length).toBe(0);
  });

  test('throws when wallet not found', () => {
    const { service } = createService({
      findWalletByUserId: mock<WalletServiceDependencies['findWalletByUserId']>(() =>
        Promise.resolve(null),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toBeInstanceOf(WalletError);
  });

  test('throws when balance is insufficient', () => {
    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(100n)),
          transfer: mock(() => Promise.resolve({ hash: '0x0' })),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Insufficient USDC balance');
  });

  test('wraps contract errors into wallet error', () => {
    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() => Promise.reject(new Error('ERC20InvalidReceiver'))),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow(
      'Destination address is invalid for USDC transfers',
    );
  });

  test('maps insufficient allowance errors to 400', () => {
    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() => Promise.reject(new Error('ERC20InsufficientAllowance'))),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Insufficient allowance for USDC transfer');
  });

  test('maps nonce too low errors to 400', () => {
    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() => Promise.reject(new Error('nonce too low'))),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Transaction nonce too low for wallet');
  });

  test('maps replacement transaction fee errors to 400', () => {
    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() =>
            Promise.reject(new Error('replacement transaction underpriced')),
          ),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Replacement transaction fee too low');
  });

  test('maps rate limit errors to 429', () => {
    const rateLimitError = new Error('Too many requests');
    (rateLimitError as Error & { code: number }).code = 429;

    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() => Promise.reject(rateLimitError)),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Flow network rate limited, please retry later');
  });

  test('maps upstream availability errors to 504', () => {
    const upstreamError = new Error('Bad Gateway');
    (upstreamError as Error & { status: number }).status = 502;

    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() => Promise.reject(upstreamError)),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Flow network unavailable, please retry later');
  });

  test('maps timeout errors to 504', () => {
    const { service } = createService({
      getUsdcContract: mock<WalletServiceDependencies['getUsdcContract']>(() =>
        makeContract({
          balanceOf: mock(() => Promise.resolve(2_000_000n)),
          transfer: mock(() => Promise.reject(new Error('timeout exceeded'))),
        }),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1');
    return expect(transferPromise).rejects.toThrow('Flow network timeout, please retry later');
  });

  test('rejects when userId missing', () => {
    const { service } = createService();

    const transferPromise = service.transferUsdc(mockDb, basePayload, undefined);
    return expect(transferPromise).rejects.toThrow('Unauthorized');
  });

  test('returns cached transaction when idempotency key already processed', async () => {
    const cachedEntry = {
      id: 1,
      userId: 1,
      idempotencyKeyHash: 'hash',
      amount: 1_500_000n,
      destinationAddress: '0x0000000000000000000000000000000000000002',
      transactionHash: '0xcached',
      status: 'completed' as TransferRequest['status'],
      createdAt: new Date(),
    };
    const findTransferRequestMock = mock<WalletServiceDependencies['findTransferRequest']>(() =>
      Promise.resolve(cachedEntry),
    );
    const { service, createTransferRequestMock } = createService({
      findTransferRequest: findTransferRequestMock,
    });

    const result = await service.transferUsdc(mockDb, basePayload, '1', 'key');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') {
      throw new Error('Expected completed status');
    }
    expect(result.transactionHash).toBe('0xcached');
    expect(findTransferRequestMock).toHaveBeenCalled();
    expect(createTransferRequestMock.mock.calls.length).toBe(0);
  });

  test('returns pending when idempotent transfer is already in progress', async () => {
    const pendingEntry: TransferRequest = {
      id: 1,
      userId: 1,
      idempotencyKeyHash: 'hash',
      amount: 1_500_000n,
      destinationAddress: '0x0000000000000000000000000000000000000002',
      transactionHash: null,
      status: 'pending',
      createdAt: new Date(),
    };

    const { service, transferMock, createTransferRequestMock } = createService({
      findTransferRequest: mock(() => Promise.resolve(pendingEntry)),
    });

    const result = await service.transferUsdc(mockDb, basePayload, '1', 'key');

    expect(result.status).toBe('pending');
    expect(transferMock).not.toHaveBeenCalled();
    expect(createTransferRequestMock.mock.calls.length).toBe(0);
  });

  test('throws conflict when idempotency key reused with different payload', () => {
    const { service } = createService({
      findTransferRequest: mock(() =>
        Promise.resolve({
          id: 1,
          userId: 1,
          idempotencyKeyHash: 'hash',
          amount: 2_000_000n,
          destinationAddress: '0x0000000000000000000000000000000000000002',
          transactionHash: '0xhash',
          status: 'completed',
          createdAt: new Date(),
        } satisfies TransferRequest),
      ),
    });

    const transferPromise = service.transferUsdc(mockDb, basePayload, '1', 'key');
    return expect(transferPromise).rejects.toThrow(
      'Idempotency key already used with different payload',
    );
  });

  test('persists idempotency reservation and completion after successful transfer', async () => {
    const { service, createTransferRequestMock, updateTransferRequestMock } = createService();

    const result = await service.transferUsdc(mockDb, basePayload, '1', 'key');

    expect(result.status).toBe('completed');
    if (result.status !== 'completed') {
      throw new Error('Expected completed status');
    }
    expect(result.transactionHash).toBe('0xtxhash');

    expect(createTransferRequestMock.mock.calls.length).toBe(1);
    const createCall = createTransferRequestMock.mock.calls[0] as
      | Parameters<WalletServiceDependencies['createTransferRequest']>
      | undefined;
    if (!createCall) {
      throw new Error('Expected createTransferRequest to be called');
    }
    const [createDb, createPayload] = createCall;
    expect(createDb).toBeDefined();
    expect(createPayload.status).toBe('pending');
    expect(createPayload.transactionHash).toBeNull();
    expect(typeof createPayload.idempotencyKeyHash).toBe('string');
    expect(createPayload.amount).toBe(1_500_000n);

    expect(updateTransferRequestMock.mock.calls.length).toBe(1);
    const updateCall = updateTransferRequestMock.mock.calls[0] as
      | Parameters<WalletServiceDependencies['updateTransferRequest']>
      | undefined;
    if (!updateCall) {
      throw new Error('Expected updateTransferRequest to be called');
    }
    const [updateDb, updateId, updatePayload] = updateCall;
    expect(updateDb).toBe(mockDb);
    expect(updateId).toBe(1);
    expect(updatePayload).toEqual({ transactionHash: '0xtxhash', status: 'completed' });
  });
});
