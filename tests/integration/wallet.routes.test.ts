import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import '../setup';

void mock.module('@/db/client', () => ({
  getDb: () => ({ db: {} }),
}));

afterEach(() => {
  mock.restore();
});

describe('Wallet routes', () => {
  test('POST /wallet/transfer returns transaction hash', async () => {
    const { walletService } = await import('@/services/wallet.service');
    spyOn(walletService, 'transferUsdc').mockResolvedValue({
      status: 'completed',
      transactionHash: '0xtx',
    });

    const tokenModule = await import('@/services/token.service');
    spyOn(tokenModule.tokenService, 'verifyAccessToken').mockResolvedValue({
      sub: '1',
      tokenType: 'access',
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({
        amount: '1.5',
        destinationAddress: '0x0000000000000000000000000000000000000002',
      }),
    });

    expect(response.status).toBe(202);
    const json = (await response.json()) as { transactionHash: string };
    expect(json.transactionHash).toBe('0xtx');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  test('POST /wallet/transfer surfaces pending status', async () => {
    const { walletService } = await import('@/services/wallet.service');
    spyOn(walletService, 'transferUsdc').mockResolvedValue({ status: 'pending' });

    const tokenModule = await import('@/services/token.service');
    spyOn(tokenModule.tokenService, 'verifyAccessToken').mockResolvedValue({
      sub: '1',
      tokenType: 'access',
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({
        amount: '1.5',
        destinationAddress: '0x0000000000000000000000000000000000000002',
      }),
    });

    expect(response.status).toBe(202);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.message).toBe('Transfer already in progress');
    expect(json).not.toHaveProperty('transactionHash');
  });

  test('fails when auth guard rejects token', async () => {
    const tokenModule = await import('@/services/token.service');
    spyOn(tokenModule.tokenService, 'verifyAccessToken').mockResolvedValue(null);

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid',
      },
      body: JSON.stringify({
        amount: '1.5',
        destinationAddress: '0x0000000000000000000000000000000000000002',
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
  });

  test('propagates WalletError status codes', async () => {
    const { walletService, WalletError } = await import('@/services/wallet.service');
    spyOn(walletService, 'transferUsdc').mockRejectedValue(
      new WalletError('Insufficient USDC balance', 400, 'insufficient_balance'),
    );

    const tokenModule = await import('@/services/token.service');
    spyOn(tokenModule.tokenService, 'verifyAccessToken').mockResolvedValue({
      sub: '1',
      tokenType: 'access',
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({
        amount: '1.5',
        destinationAddress: '0x0000000000000000000000000000000000000002',
      }),
    });

    expect(response.status).toBe(400);
    const json = (await response.json()) as { code: string; message: string; requestId?: string };
    expect(json.code).toBe('insufficient_balance');
    expect(json.message).toBe('Insufficient USDC balance');
    expect(typeof json.requestId).toBe('string');
  });

  test('rejects when payload validation fails', async () => {
    const tokenModule = await import('@/services/token.service');
    spyOn(tokenModule.tokenService, 'verifyAccessToken').mockResolvedValue({
      sub: '1',
      tokenType: 'access',
    });

    const { walletService } = await import('@/services/wallet.service');
    const transferSpy = spyOn(walletService, 'transferUsdc');

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({
        amount: '0',
        destinationAddress: '0x0000000000000000000000000000000000000002',
      }),
    });

    expect(response.status).toBe(400);
    expect(transferSpy).not.toHaveBeenCalled();
  });

  test('passes Idempotency-Key header to wallet service', async () => {
    const { walletService } = await import('@/services/wallet.service');
    const transferSpy = spyOn(walletService, 'transferUsdc').mockResolvedValue({
      status: 'completed',
      transactionHash: '0xabc',
    });

    const tokenModule = await import('@/services/token.service');
    spyOn(tokenModule.tokenService, 'verifyAccessToken').mockResolvedValue({
      sub: '1',
      tokenType: 'access',
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/wallet/transfer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
        'Idempotency-Key': 'unique-key',
      },
      body: JSON.stringify({
        amount: '1.5',
        destinationAddress: '0x0000000000000000000000000000000000000002',
      }),
    });

    expect(response.status).toBe(202);
    expect(transferSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '1',
      'unique-key',
    );
  });
});
