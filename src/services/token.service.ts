import type { JWTPayload } from "jose";

import { createLogger } from "@/utils/logger";

const logger = createLogger("token-service");

export type VerifiedTokenPayload = JWTPayload & {
  sub: string;
};

export class TokenService {
  // TODO: inject actual signing keys via dependency injection once crypto module is ready.
  verifyAccessToken(token: string): Promise<VerifiedTokenPayload | null> {
    logger.debug("Attempting to verify access token", {
      hasToken: Boolean(token),
      tokenLength: token.length
    });
    return Promise.resolve(null);
  }
}

export const tokenService = new TokenService();
