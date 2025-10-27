import { beforeAll, describe, expect, test } from 'bun:test';
import { importPKCS8, SignJWT } from 'jose';

import '../setup';

import { env } from '@/config/env';

const loadTokenService = async () => {
  return import('@/services/token.service');
};

const ALGORITHM = 'RS256';
let signingKey: Awaited<ReturnType<typeof importPKCS8>>;

beforeAll(async () => {
  signingKey = await importPKCS8(env.jwt.privateKey, ALGORITHM);
});

const issueCustomToken = async (
  tokenType: 'access' | 'refresh',
  options: {
    issuer?: string;
    audience?: string;
    ttl?: string;
    subject?: string;
    extraClaims?: Record<string, unknown>;
  } = {},
) => {
  const { issuer, audience, ttl, subject, extraClaims } = {
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    ttl: tokenType === 'access' ? env.jwt.accessTokenTtl : env.jwt.refreshTokenTtl,
    subject: '42',
    extraClaims: {} as Record<string, unknown>,
    ...options,
  };

  return new SignJWT({ tokenType, ...extraClaims })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(ttl)
    .sign(signingKey as never);
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
    expect(verifiedAccess?.iss).toBe(env.jwt.issuer);
    expect(verifiedAccess?.aud).toBe(env.jwt.audience);

    const verifiedRefresh = await tokenService.verifyRefreshToken(issued.refreshToken);
    expect(verifiedRefresh?.sub).toBe('42');
    expect(verifiedRefresh?.tokenType).toBe('refresh');
    expect(verifiedRefresh?.jti).toBe(issued.refreshPayload.jti);
    expect(verifiedRefresh?.iss).toBe(env.jwt.issuer);
    expect(verifiedRefresh?.aud).toBe(env.jwt.audience);
  });

  test('returns null for invalid tokens', async () => {
    const { tokenService } = await loadTokenService();

    const invalidAccess = await tokenService.verifyAccessToken('invalid');
    expect(invalidAccess).toBeNull();

    const invalidRefresh = await tokenService.verifyRefreshToken('invalid');
    expect(invalidRefresh).toBeNull();
  });

  test('rejects access tokens with invalid issuer', async () => {
    const { tokenService } = await loadTokenService();

    const forged = await issueCustomToken('access', { issuer: 'attacker' });
    const verified = await tokenService.verifyAccessToken(forged);

    expect(verified).toBeNull();
  });

  test('rejects access tokens with invalid audience', async () => {
    const { tokenService } = await loadTokenService();

    const forged = await issueCustomToken('access', { audience: 'wrong-audience' });
    const verified = await tokenService.verifyAccessToken(forged);

    expect(verified).toBeNull();
  });

  test('rejects refresh tokens with invalid issuer', async () => {
    const { tokenService } = await loadTokenService();

    const forged = await issueCustomToken('refresh', {
      issuer: 'attacker',
      extraClaims: { jti: 'forged' },
    });
    const verified = await tokenService.verifyRefreshToken(forged);

    expect(verified).toBeNull();
  });

  test('rejects refresh tokens with invalid audience', async () => {
    const { tokenService } = await loadTokenService();

    const forged = await issueCustomToken('refresh', {
      audience: 'wrong-audience',
      extraClaims: { jti: 'forged' },
    });
    const verified = await tokenService.verifyRefreshToken(forged);

    expect(verified).toBeNull();
  });
});
