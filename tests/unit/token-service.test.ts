import { describe, expect, test } from 'bun:test';

import '../setup';

const loadTokenService = async () => {
  return import('@/services/token.service');
};

describe('tokenService', () => {
  test('issues and verifies tokens', async () => {
    const { tokenService } = await loadTokenService();

    const issued = await tokenService.issueTokens(42);
    expect(typeof issued.accessToken).toBe('string');
    expect(typeof issued.refreshToken).toBe('string');

    const verifiedAccess = await tokenService.verifyAccessToken(issued.accessToken);
    expect(verifiedAccess?.sub).toBe('42');
    expect(verifiedAccess?.tokenType).toBe('access');

    const verifiedRefresh = await tokenService.verifyRefreshToken(issued.refreshToken);
    expect(verifiedRefresh?.sub).toBe('42');
    expect(verifiedRefresh?.tokenType).toBe('refresh');
    expect(verifiedRefresh?.jti).toBe(issued.refreshPayload.jti);
  });

  test('returns null for invalid tokens', async () => {
    const { tokenService } = await loadTokenService();

    const invalidAccess = await tokenService.verifyAccessToken('invalid');
    expect(invalidAccess).toBeNull();

    const invalidRefresh = await tokenService.verifyRefreshToken('invalid');
    expect(invalidRefresh).toBeNull();
  });
});
