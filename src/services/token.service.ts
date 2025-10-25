import { randomBytes } from 'crypto';

import { decodeJwt, importPKCS8, importSPKI, jwtVerify, SignJWT, type JWTPayload } from 'jose';

import { env } from '@/config/env';
import { createLogger } from '@/utils/logger';

const logger = createLogger('token-service');

type TokenType = 'access' | 'refresh';

export type VerifiedTokenPayload = JWTPayload & {
  sub: string;
  tokenType: TokenType;
};

export type RefreshTokenPayload = VerifiedTokenPayload & {
  jti: string;
  exp: number;
};

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  refreshPayload: RefreshTokenPayload;
};

const ALGORITHM = 'RS256';

export class TokenService {
  private signingKey?: Awaited<ReturnType<typeof importPKCS8>>;
  private verificationKey?: Awaited<ReturnType<typeof importSPKI>>;

  private async getPrivateKey(): Promise<Awaited<ReturnType<typeof importPKCS8>>> {
    if (!this.signingKey) {
      this.signingKey = await importPKCS8(env.jwt.privateKey, ALGORITHM);
    }

    return this.signingKey;
  }

  private async getPublicKey(): Promise<Awaited<ReturnType<typeof importSPKI>>> {
    if (!this.verificationKey) {
      this.verificationKey = await importSPKI(env.jwt.publicKey, ALGORITHM);
    }

    return this.verificationKey;
  }

  private async signToken(
    userId: number,
    tokenType: TokenType,
    ttl: string,
    extraClaims: Record<string, unknown> = {},
  ): Promise<string> {
    const signer = new SignJWT({ tokenType, ...extraClaims })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(String(userId))
      .setIssuedAt()
      .setExpirationTime(ttl);

    // The jose typings expose a flexible KeyLike union which trips the type checker.
    // We trust the imported PKCS8 material, so we cast explicitly before signing.
    const privateKey = await this.getPrivateKey();
    return signer.sign(privateKey as never);
  }

  private decodeRefreshToken(token: string): RefreshTokenPayload {
    const payload = decodeJwt(token) as JWTPayload & {
      tokenType?: TokenType;
      jti?: string;
    };

    if (payload.tokenType !== 'refresh' || !payload.sub || !payload.jti || !payload.exp) {
      throw new Error('Invalid refresh token payload');
    }

    return payload as RefreshTokenPayload;
  }

  async issueTokens(userId: number): Promise<IssuedTokens> {
    const accessToken = await this.signToken(userId, 'access', env.jwt.accessTokenTtl);
    const refreshToken = await this.signToken(userId, 'refresh', env.jwt.refreshTokenTtl, {
      jti: randomBytes(16).toString('hex'),
    });

    const refreshPayload = this.decodeRefreshToken(refreshToken);

    return {
      accessToken,
      refreshToken,
      refreshPayload,
    };
  }

  async verifyAccessToken(token: string): Promise<VerifiedTokenPayload | null> {
    logger.debug('Attempting to verify access token', {
      hasToken: Boolean(token),
      tokenLength: token.length,
    });

    try {
      const publicKey = await this.getPublicKey();
      const verification = await jwtVerify(token, publicKey as never, {
        algorithms: [ALGORITHM],
      });
      const payload = verification.payload as JWTPayload & {
        tokenType?: TokenType;
      };

      if (payload.tokenType !== 'access' || !payload.sub) {
        return null;
      }

      return payload as VerifiedTokenPayload;
    } catch (error) {
      logger.warn('Access token verification failed', error);
      return null;
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
    logger.debug('Attempting to verify refresh token');

    try {
      const publicKey = await this.getPublicKey();
      const verification = await jwtVerify(token, publicKey as never, {
        algorithms: [ALGORITHM],
      });
      const payload = verification.payload as JWTPayload & {
        tokenType?: TokenType;
        jti?: string;
        exp?: number;
      };

      if (payload.tokenType !== 'refresh' || !payload.sub || !payload.jti || !payload.exp) {
        return null;
      }

      return payload as RefreshTokenPayload;
    } catch (error) {
      logger.warn('Refresh token verification failed', error);
      return null;
    }
  }
}

export const tokenService = new TokenService();
