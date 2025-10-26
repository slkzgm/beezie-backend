import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import '../setup';

void mock.module('@/db/client', () => ({
  getDb: () => ({ db: {} }),
}));

afterEach(() => {
  mock.restore();
});

describe('Auth routes - successes', () => {
  test('POST /auth/sign-in returns tokens and request id header', async () => {
    const { authService } = await import('@/services/auth.service');
    spyOn(authService, 'authenticateUser').mockResolvedValue({
      userId: 1,
      email: 'user@example.com',
      displayName: 'User',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date().toISOString(),
    });

    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'SuperSecretPassword123!' }),
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.email).toBe('user@example.com');
    expect(json).toHaveProperty('accessToken', 'access-token');
    expect(json).toHaveProperty('refreshToken', 'refresh-token');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });
});
