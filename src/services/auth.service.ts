import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { createLogger } from '@/utils/logger';
import type { RefreshInput, SignInInput, SignUpInput } from '@/schemas/auth.schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import { cryptoManager } from '@/lib/crypto';
import { generateWallet } from '@/lib/ethers';
import { users as usersRepository } from '@/db/repositories';
import { wallets as walletsRepository } from '@/db/repositories';
import { refreshTokens as refreshTokensRepository } from '@/db/repositories';
import { withTransaction } from '@/db/repositories';
import type { Database } from '@/db/types';
import { tokenService } from '@/services/token.service';
import { sha256Hex } from '@/utils/hash';

const logger = createLogger('auth-service');

const isDuplicateEntryError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const mysqlError = error as { code?: string; errno?: number };
  return mysqlError.code === 'ER_DUP_ENTRY' || mysqlError.errno === 1062;
};

export class AuthError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(message: string, status: ContentfulStatusCode, code = 'auth_error') {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

type SignInResult = {
  userId: number;
  email: string;
  displayName: string | null;
} & AuthTokens;

type SignUpResult = {
  userId: number;
  email: string;
  displayName: string | null;
  walletAddress: string;
} & AuthTokens;

export class AuthService {
  async registerUser(db: Database, payload: SignUpInput): Promise<SignUpResult> {
    logger.debug('registerUser invoked', { email: payload.email });

    const { email, password, displayName } = payload;

    const existingUser = await usersRepository.findUserByEmail(db, email);

    if (existingUser) {
      throw new AuthError('Email is already registered', 409, 'user_already_exists');
    }

    const passwordHash = await hashPassword(password);
    const wallet = generateWallet();
    const encryptedPrivateKey = await cryptoManager.encryptPrivateKey(wallet.privateKey);

    try {
      const userAndWallet = await withTransaction(db, async (tx) => {
        const createdUser = await usersRepository.createUser(tx, {
          email,
          passwordHash,
          displayName,
        });

        if (!createdUser) {
          throw new AuthError('Failed to create user', 500, 'user_creation_failed');
        }

        const createdWallet = await walletsRepository.createWallet(tx, {
          userId: createdUser.id,
          address: wallet.address,
          encryptedPrivateKey,
        });

        if (!createdWallet) {
          throw new AuthError('Failed to create wallet', 500, 'wallet_creation_failed');
        }

        const issuedTokens = await tokenService.issueTokens(createdUser.id);
        const refreshExpiresAt = new Date(issuedTokens.refreshPayload.exp * 1000);

        await refreshTokensRepository.deleteRefreshTokensByUserId(tx, createdUser.id);

        const refreshTokenHash = sha256Hex(issuedTokens.refreshToken);

        await refreshTokensRepository.createRefreshToken(tx, {
          userId: createdUser.id,
          tokenHash: refreshTokenHash,
          expiresAt: refreshExpiresAt,
        });

        return {
          createdUser,
          createdWallet,
          issuedTokens,
          refreshExpiresAt,
        };
      });

      return {
        userId: userAndWallet.createdUser.id,
        email: userAndWallet.createdUser.email,
        displayName: userAndWallet.createdUser.displayName ?? null,
        walletAddress: userAndWallet.createdWallet.address,
        accessToken: userAndWallet.issuedTokens.accessToken,
        refreshToken: userAndWallet.issuedTokens.refreshToken,
        refreshTokenExpiresAt: userAndWallet.refreshExpiresAt.toISOString(),
      };
    } catch (error: unknown) {
      logger.error('Failed to register user', error instanceof Error ? error : { error });
      if (error instanceof AuthError) {
        throw error;
      }
      if (isDuplicateEntryError(error)) {
        throw new AuthError('Email is already registered', 409, 'user_already_exists');
      }
      throw new AuthError('Unable to register user', 500, 'registration_failed');
    }
  }

  async authenticateUser(db: Database, payload: SignInInput): Promise<SignInResult> {
    logger.debug('authenticateUser invoked', { email: payload.email });

    const { email, password } = payload;

    const user = await usersRepository.findUserByEmail(db, email);

    if (!user) {
      throw new AuthError('Invalid credentials', 401, 'invalid_credentials');
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AuthError('Invalid credentials', 401, 'invalid_credentials');
    }

    const { issuedTokens, refreshExpiresAt } = await withTransaction(db, async (tx) => {
      const tokens = await tokenService.issueTokens(user.id);
      const refreshExpiresAt = new Date(tokens.refreshPayload.exp * 1000);

      await refreshTokensRepository.deleteRefreshTokensByUserId(tx, user.id);

      const refreshTokenHash = sha256Hex(tokens.refreshToken);

      await refreshTokensRepository.createRefreshToken(tx, {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
      });

      return { issuedTokens: tokens, refreshExpiresAt };
    });

    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName ?? null,
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  async refreshSession(
    db: Database,
    refreshToken: RefreshInput['refreshToken'],
  ): Promise<SignInResult> {
    logger.debug('refreshSession invoked');

    try {
      const verified = await tokenService.verifyRefreshToken(refreshToken);

      if (!verified || !verified.sub) {
        throw new AuthError('Invalid refresh token', 401, 'invalid_refresh_token');
      }

      const userId = Number(verified.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new AuthError('Invalid refresh token', 401, 'invalid_refresh_token');
      }

      const refreshHash = sha256Hex(refreshToken);

      const { user, issuedTokens, refreshExpiresAt } = await withTransaction(db, async (tx) => {
        const storedToken = await refreshTokensRepository.findRefreshTokenByHash(tx, refreshHash);

        if (!storedToken) {
          throw new AuthError('Invalid refresh token', 401, 'invalid_refresh_token');
        }

        if (storedToken.expiresAt.getTime() <= Date.now()) {
          await refreshTokensRepository.deleteRefreshToken(tx, refreshHash);
          throw new AuthError('Refresh token expired', 401, 'refresh_token_expired');
        }

        const userRecord = await usersRepository.findUserById(tx, userId);
        if (!userRecord) {
          await refreshTokensRepository.deleteRefreshToken(tx, refreshHash);
          throw new AuthError('Invalid refresh token', 401, 'invalid_refresh_token');
        }

        const tokens = await tokenService.issueTokens(userRecord.id);
        const refreshExpiresAt = new Date(tokens.refreshPayload.exp * 1000);

        await refreshTokensRepository.deleteRefreshTokensByUserId(tx, userRecord.id);

        await refreshTokensRepository.createRefreshToken(tx, {
          userId: userRecord.id,
          tokenHash: sha256Hex(tokens.refreshToken),
          expiresAt: refreshExpiresAt,
        });

        return { user: userRecord, issuedTokens: tokens, refreshExpiresAt };
      });

      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName ?? null,
        accessToken: issuedTokens.accessToken,
        refreshToken: issuedTokens.refreshToken,
        refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      };
    } catch (error: unknown) {
      logger.error('Failed to refresh session', error instanceof Error ? error : { error });
      if (error instanceof AuthError) {
        throw error;
      }

      throw new AuthError('Unable to refresh session', 500, 'refresh_failed');
    }
  }
}
export const authService = new AuthService();
