import { beforeEach, describe, expect, mock, test } from 'bun:test';

import '../setup';

import { sha256Hex } from '@/utils/hash';

import type { Database } from '@/db/types';
import type { RefreshTokenPayload } from '@/services/token.service';

type StoredToken = {
  id: number;
  userId: number;
  tokenHash: string;
  jwtId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  reusedAt: Date | null;
  createdAt: Date;
};

const storedTokens = new Map<string, StoredToken>();
let refreshTokenId = 1;

const userRecord = {
  id: 1,
  email: 'user@example.com',
  passwordHash: 'hashed',
  displayName: 'User',
};

let verifyResult: RefreshTokenPayload | null = null;
let issueResult: {
  accessToken: string;
  refreshToken: string;
  refreshPayload: RefreshTokenPayload;
} | null = null;

const findRefreshTokenByHash = async (_db: Database, tokenHash: string) =>
  storedTokens.get(tokenHash) ?? null;

const markRefreshTokensRotatedForUser = async (
  _db: Database,
  userId: number,
  rotatedAt: Date,
) => {
  for (const token of storedTokens.values()) {
    if (token.userId === userId && token.rotatedAt === null) {
      token.rotatedAt = rotatedAt;
    }
  }
};

const markRefreshTokenReused = async (_db: Database, tokenHash: string, reusedAt: Date) => {
  const token = storedTokens.get(tokenHash);
  if (token) {
    token.reusedAt = reusedAt;
    if (token.rotatedAt === null) {
      token.rotatedAt = reusedAt;
    }
  }
};

const createRefreshToken = async (
  _db: Database,
  data: {
    userId: number;
    tokenHash: string;
    jwtId: string;
    expiresAt: Date;
  },
) => {
  const record: StoredToken = {
    id: refreshTokenId++,
    userId: data.userId,
    tokenHash: data.tokenHash,
    jwtId: data.jwtId,
    expiresAt: data.expiresAt,
    rotatedAt: null,
    reusedAt: null,
    createdAt: new Date(),
  };
  storedTokens.set(record.tokenHash, record);
  return record;
};

const usersRepositoryStub = {
  async findUserById(_db: Database, id: number) {
    return id === userRecord.id ? { ...userRecord } : null;
  },
  async findUserByEmail() {
    return null;
  },
  async createUser() {
    return null;
  },
};

const walletsRepositoryStub = {
  async createWallet() {
    return null;
  },
};

const refreshTokensRepositoryStub = {
  findRefreshTokenByHash,
  markRefreshTokensRotatedForUser,
  markRefreshTokenReused,
  createRefreshToken,
  async deleteRefreshToken() {
    return true;
  },
  async deleteRefreshTokensByUserId() {
    return 0;
  },
};

const withTransactionStub = async <T>(_db: Database, handler: (tx: Database) => Promise<T>) => {
  return handler({} as Database);
};

const tokenServiceStub = {
  async verifyRefreshToken(token: string) {
    if (!verifyResult) {
      throw new Error(`Unexpected token verification for ${token}`);
    }
    return verifyResult;
  },
  async issueTokens() {
    if (!issueResult) {
      throw new Error('issueTokens called without fixture');
    }
    return issueResult;
  },
};

mock.module('@/db/repositories', () => ({
  users: usersRepositoryStub,
  wallets: walletsRepositoryStub,
  refreshTokens: refreshTokensRepositoryStub,
  withTransaction: withTransactionStub,
}));

mock.module('@/services/token.service', () => ({
  tokenService: tokenServiceStub,
}));

const authModulePromise = import('@/services/auth.service');

beforeEach(() => {
  storedTokens.clear();
  refreshTokenId = 1;
  verifyResult = null;
  issueResult = null;
});

describe('AuthService.refreshSession', () => {
  test('rotates refresh token and persists new metadata', async () => {
    const now = Date.now();
    const refreshToken = 'valid-refresh-token';
    const refreshHash = sha256Hex(refreshToken);

    storedTokens.set(refreshHash, {
      id: 1,
      userId: userRecord.id,
      tokenHash: refreshHash,
      jwtId: 'refresh-jti',
      expiresAt: new Date(now + 60_000),
      rotatedAt: null,
      reusedAt: null,
      createdAt: new Date(now - 1_000),
    });

    verifyResult = {
      sub: String(userRecord.id),
      tokenType: 'refresh',
      jti: 'refresh-jti',
      exp: Math.floor((now + 60_000) / 1000),
    } as RefreshTokenPayload;

    const newRefreshToken = 'next-refresh-token';
    issueResult = {
      accessToken: 'next-access-token',
      refreshToken: newRefreshToken,
      refreshPayload: {
        sub: String(userRecord.id),
        tokenType: 'refresh',
        jti: 'next-refresh-jti',
        exp: Math.floor((now + 120_000) / 1000),
      } as RefreshTokenPayload,
    };

    const { authService } = await authModulePromise;
    const result = await authService.refreshSession({} as Database, refreshToken);

    expect(result.accessToken).toBe('next-access-token');
    expect(result.refreshToken).toBe(newRefreshToken);

    const originalTokenRecord = storedTokens.get(refreshHash);
    expect(originalTokenRecord?.rotatedAt).toBeInstanceOf(Date);
    expect(originalTokenRecord?.reusedAt).toBeNull();

    const nextHash = sha256Hex(newRefreshToken);
    const nextTokenRecord = storedTokens.get(nextHash);
    expect(nextTokenRecord).toBeDefined();
    expect(nextTokenRecord?.jwtId).toBe('next-refresh-jti');
    expect(nextTokenRecord?.rotatedAt).toBeNull();
  });

  test('flags reuse when rotated token is presented again', async () => {
    const now = Date.now();
    const refreshToken = 'reused-refresh-token';
    const refreshHash = sha256Hex(refreshToken);

    storedTokens.set(refreshHash, {
      id: 1,
      userId: userRecord.id,
      tokenHash: refreshHash,
      jwtId: 'rotated-jti',
      expiresAt: new Date(now + 60_000),
      rotatedAt: new Date(now - 5_000),
      reusedAt: null,
      createdAt: new Date(now - 10_000),
    });

    verifyResult = {
      sub: String(userRecord.id),
      tokenType: 'refresh',
      jti: 'rotated-jti',
      exp: Math.floor((now + 60_000) / 1000),
    } as RefreshTokenPayload;

    const { authService } = await authModulePromise;

    await expect(authService.refreshSession({} as Database, refreshToken)).rejects.toMatchObject({
      code: 'refresh_token_reused',
    });

    const record = storedTokens.get(refreshHash);
    expect(record?.reusedAt).toBeInstanceOf(Date);
  });
});
