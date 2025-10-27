import { beforeAll, describe, expect, test } from 'bun:test';
import { decodeProtectedHeader, importPKCS8, SignJWT } from 'jose';

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
    kid?: string | null;
  } = {},
) => {
  const { issuer, audience, ttl, subject, extraClaims, kid } = {
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    ttl: tokenType === 'access' ? env.jwt.accessTokenTtl : env.jwt.refreshTokenTtl,
    subject: '42',
    extraClaims: {} as Record<string, unknown>,
    kid: env.jwt.keyId,
    ...options,
  };

  const signer = new SignJWT({ tokenType, ...extraClaims })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(ttl);

  const header: Parameters<SignJWT['setProtectedHeader']>[0] = { alg: ALGORITHM };
  if (kid) {
    header.kid = kid;
  }

  return signer.setProtectedHeader(header).sign(signingKey as never);
};

describe('tokenService', () => {
  test('issues and verifies tokens', async () => {
    const { tokenService } = await loadTokenService();

    const issued = await tokenService.issueTokens(42);
    expect(typeof issued.accessToken).toBe('string');
    expect(typeof issued.refreshToken).toBe('string');

    const accessHeader = decodeProtectedHeader(issued.accessToken);
    expect(accessHeader.kid).toBe(env.jwt.keyId);

    const verifiedAccess = await tokenService.verifyAccessToken(issued.accessToken);
    expect(verifiedAccess?.sub).toBe('42');
    expect(verifiedAccess?.tokenType).toBe('access');
    expect(verifiedAccess?.iss).toBe(env.jwt.issuer);
    expect(verifiedAccess?.aud).toBe(env.jwt.audience);

    const refreshHeader = decodeProtectedHeader(issued.refreshToken);
    expect(refreshHeader.kid).toBe(env.jwt.keyId);

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

  test('rejects access tokens without key identifier', async () => {
    const { tokenService } = await loadTokenService();

    const forged = await issueCustomToken('access', { kid: null });
    const verified = await tokenService.verifyAccessToken(forged);

    expect(verified).toBeNull();
  });

  test('rejects refresh tokens signed with unknown key identifier', async () => {
    const { tokenService } = await loadTokenService();

    const forged = await issueCustomToken('refresh', {
      kid: 'unknown-key',
      extraClaims: { jti: 'forged' },
    });
    const verified = await tokenService.verifyRefreshToken(forged);

    expect(verified).toBeNull();
  });
});
