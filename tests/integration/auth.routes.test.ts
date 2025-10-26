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
    const json = (await response.json()) as { email: string };
    expect(json.email).toBe('user@example.com');
    expect(registerSpy).toHaveBeenCalled();
  });

  test('POST /auth/sign-in propagates AuthError status', async () => {
    const { authService, AuthError } = await import('@/services/auth.service');
    spyOn(authService, 'authenticateUser').mockRejectedValue(
      new AuthError('Invalid credentials', 401),
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
    const json = (await response.json()) as { message: string };
    expect(json.message).toBe('Invalid credentials');
  });
});
