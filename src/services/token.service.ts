import { randomBytes } from 'crypto';

import {
  decodeJwt,
  decodeProtectedHeader,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWSHeaderParameters,
  type JWTPayload,
} from 'jose';

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
  private signingKey?: {
    kid: string;
    key: Awaited<ReturnType<typeof importPKCS8>>;
    loadedAt: Date;
  };
  private verificationKeys = new Map<
    string,
    { key: Awaited<ReturnType<typeof importSPKI>>; loadedAt: Date }
  >();

  private async getSigningKey() {
    if (!this.signingKey) {
      const key = await importPKCS8(env.jwt.privateKey, ALGORITHM);
      this.signingKey = {
        kid: env.jwt.keyId,
        key,
        loadedAt: new Date(),
      };
      logger.debug('Loaded signing key material', {
        kid: this.signingKey.kid,
      });
    }

    return this.signingKey;
  }

  private async getVerificationKey(kid: string) {
    const cached = this.verificationKeys.get(kid);
    if (cached) {
      return cached;
    }

    if (kid !== env.jwt.keyId) {
      return null;
    }

    const key = await importSPKI(env.jwt.publicKey, ALGORITHM);
    const record = { key, loadedAt: new Date() } as const;
    this.verificationKeys.set(kid, record);
    logger.debug('Loaded verification key material', {
      kid,
    });
    return record;
  }

  private static extractKid(header: JWSHeaderParameters): string | null {
    if (!header.kid) {
      return null;
    }

    return typeof header.kid === 'string' ? header.kid : null;
  }

  private async signToken(
    userId: number,
    tokenType: TokenType,
    ttl: string,
    extraClaims: Record<string, unknown> = {},
  ): Promise<string> {
    const signingKey = await this.getSigningKey();
    const signer = new SignJWT({ tokenType, ...extraClaims })
      .setProtectedHeader({ alg: ALGORITHM, kid: signingKey.kid })
      .setSubject(String(userId))
      .setIssuer(env.jwt.issuer)
      .setAudience(env.jwt.audience)
      .setIssuedAt()
      .setNotBefore('0s')
      .setExpirationTime(ttl);

    // The jose typings expose a flexible KeyLike union which trips the type checker.
    // We trust the imported PKCS8 material, so we cast explicitly before signing.
    return signer.sign(signingKey.key as never);
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
      const header = decodeProtectedHeader(token);
      const kid = TokenService.extractKid(header);

      if (!kid) {
        logger.warn('Access token missing key identifier');
        return null;
      }

      const keyRecord = await this.getVerificationKey(kid);
      if (!keyRecord) {
        logger.warn('Access token key identifier is not trusted', { kid });
        return null;
      }

      const verification = await jwtVerify(token, keyRecord.key as never, {
        algorithms: [ALGORITHM],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
      });
      const payload = verification.payload as JWTPayload & {
        tokenType?: TokenType;
      };

      if (payload.tokenType !== 'access' || !payload.sub) {
        return null;
      }

      return payload as VerifiedTokenPayload;
    } catch (error: unknown) {
      logger.warn('Access token verification failed', error instanceof Error ? error : { error });
      return null;
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
    logger.debug('Attempting to verify refresh token');

    try {
      const header = decodeProtectedHeader(token);
      const kid = TokenService.extractKid(header);

      if (!kid) {
        logger.warn('Refresh token missing key identifier');
        return null;
      }

      const keyRecord = await this.getVerificationKey(kid);
      if (!keyRecord) {
        logger.warn('Refresh token key identifier is not trusted', { kid });
        return null;
      }

      const verification = await jwtVerify(token, keyRecord.key as never, {
        algorithms: [ALGORITHM],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
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
    } catch (error: unknown) {
      logger.warn('Refresh token verification failed', error instanceof Error ? error : { error });
      return null;
    }
  }
}

export const tokenService = new TokenService();
