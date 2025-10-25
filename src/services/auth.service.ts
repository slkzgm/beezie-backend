import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { createLogger } from '@/utils/logger';
import type { SignInInput, SignUpInput } from '@/schemas/auth.schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import { cryptoManager } from '@/lib/crypto';
import { generateDeterministicWallet } from '@/lib/ethers';
import { users as usersRepository } from '@/db/repositories';
import { wallets as walletsRepository } from '@/db/repositories';
import { refreshTokens as refreshTokensRepository } from '@/db/repositories';
import { withTransaction } from '@/db/repositories';
import type { Database } from '@/db/types';
import { tokenService } from '@/services/token.service';

const logger = createLogger('auth-service');

export class AuthError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(message: string, status: ContentfulStatusCode) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
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
      throw new AuthError('Email is already registered', 409);
    }

    const passwordHash = await hashPassword(password);
    const wallet = generateDeterministicWallet();
    const encryptedPrivateKey = await cryptoManager.encryptPrivateKey(wallet.privateKey);

    try {
      const userAndWallet = await withTransaction(db, async (tx) => {
        const createdUser = await usersRepository.createUser(tx, {
          email,
          passwordHash,
          displayName,
        });

        if (!createdUser) {
          throw new AuthError('Failed to create user', 500);
        }

        const createdWallet = await walletsRepository.createWallet(tx, {
          userId: createdUser.id,
          address: wallet.address,
          encryptedPrivateKey,
        });

        if (!createdWallet) {
          throw new AuthError('Failed to create wallet', 500);
        }

        const issuedTokens = await tokenService.issueTokens(createdUser.id);
        const refreshExpiresAt = new Date(issuedTokens.refreshPayload.exp * 1000);

        await refreshTokensRepository.deleteRefreshTokensByUserId(tx, createdUser.id);

        await refreshTokensRepository.createRefreshToken(tx, {
          userId: createdUser.id,
          token: issuedTokens.refreshToken,
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
    } catch (error) {
      logger.error('Failed to register user', error);
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Unable to register user', 500);
    }
  }

  async authenticateUser(db: Database, payload: SignInInput): Promise<SignInResult> {
    logger.debug('authenticateUser invoked', { email: payload.email });

    const { email, password } = payload;

    const user = await usersRepository.findUserByEmail(db, email);

    if (!user) {
      throw new AuthError('Invalid credentials', 401);
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AuthError('Invalid credentials', 401);
    }

    const { issuedTokens, refreshExpiresAt } = await withTransaction(db, async (tx) => {
      const tokens = await tokenService.issueTokens(user.id);
      const refreshExpiresAt = new Date(tokens.refreshPayload.exp * 1000);

      await refreshTokensRepository.deleteRefreshTokensByUserId(tx, user.id);

      await refreshTokensRepository.createRefreshToken(tx, {
        userId: user.id,
        token: tokens.refreshToken,
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
}
export const authService = new AuthService();
