import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import '../setup';

void mock.module('@/db/client', () => ({
  getDb: () => ({ db: {} }),
}));

afterEach(() => {
  mock.restore();
});

describe('Auth routes', () => {
  test('POST /auth/sign-up responds with service payload', async () => {
    const { authService } = await import('@/services/auth.service');
    const registerSpy = spyOn(authService, 'registerUser').mockResolvedValue({
      userId: 1,
      email: 'user@example.com',
      displayName: 'User',
      walletAddress: '0x0000000000000000000000000000000000000001',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date().toISOString(),
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'SuperSecurePassword123!',
        passwordConfirmation: 'SuperSecurePassword123!',
      }),
    });

    expect(response.status).toBe(201);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.email).toBe('user@example.com');
    expect(json).not.toHaveProperty('mnemonic');
    expect(registerSpy).toHaveBeenCalled();
  });

  test('POST /auth/sign-in propagates AuthError status', async () => {
    const { authService, AuthError } = await import('@/services/auth.service');
    spyOn(authService, 'authenticateUser').mockRejectedValue(
      new AuthError('Invalid credentials', 401, 'invalid_credentials'),
    );

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'WrongPassword123!',
      }),
    });

    expect(response.status).toBe(401);
    const json = (await response.json()) as { code: string; message: string; requestId?: string };
    expect(json.code).toBe('invalid_credentials');
    expect(json.message).toBe('Invalid credentials');
    expect(typeof json.requestId).toBe('string');
  });

  test('POST /auth/refresh returns rotated tokens', async () => {
    const { authService } = await import('@/services/auth.service');
    const refreshSpy = spyOn(authService, 'refreshSession').mockResolvedValue({
      userId: 1,
      email: 'user@example.com',
      displayName: 'User',
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      refreshTokenExpiresAt: new Date().toISOString(),
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'old-refresh-token' }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { accessToken: string };
    expect(json.accessToken).toBe('new-access-token');
    expect(refreshSpy).toHaveBeenCalled();
  });

  test('POST /auth/refresh propagates AuthError status', async () => {
    const { authService, AuthError } = await import('@/services/auth.service');
    spyOn(authService, 'refreshSession').mockRejectedValue(
      new AuthError('Invalid refresh token', 401, 'invalid_refresh_token'),
    );

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid' }),
    });

    expect(response.status).toBe(401);
    const json = (await response.json()) as { code: string; message: string; requestId?: string };
    expect(json.code).toBe('invalid_refresh_token');
    expect(json.message).toBe('Invalid refresh token');
    expect(typeof json.requestId).toBe('string');
  });

  test('POST /auth/sign-up rejects invalid payload', async () => {
    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: 'short', passwordConfirmation: 'short' }),
    });

    expect(response.status).toBe(400);
  });

  test('POST /auth/refresh rejects expired token', async () => {
    const { authService, AuthError } = await import('@/services/auth.service');
    spyOn(authService, 'refreshSession').mockRejectedValue(
      new AuthError('Refresh token expired', 401, 'refresh_token_expired'),
    );

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'expired' }),
    });

    expect(response.status).toBe(401);
    const json = (await response.json()) as { code: string; message: string; requestId?: string };
    expect(json.code).toBe('refresh_token_expired');
    expect(json.message).toBe('Refresh token expired');
    expect(typeof json.requestId).toBe('string');
  });
});

  test('POST /auth/refresh rejects expired token', async () => {
    const { authService, AuthError } = await import('@/services/auth.service');
    spyOn(authService, 'refreshSession').mockRejectedValue(
      new AuthError('Refresh token expired', 401, 'refresh_token_expired'),
    );

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'expired' }),
    });

    expect(response.status).toBe(401);
    const json = (await response.json()) as { code: string; message: string; requestId?: string };
    expect(json.code).toBe('refresh_token_expired');
    expect(json.message).toBe('Refresh token expired');
    expect(typeof json.requestId).toBe('string');
  });
