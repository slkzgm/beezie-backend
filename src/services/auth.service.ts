import type { SignInInput, SignUpInput } from "@/schemas/auth.schema";
import { createLogger } from "@/utils/logger";

const logger = createLogger("auth-service");

export class AuthService {
  registerUser(payload: SignUpInput): Promise<never> {
    logger.debug("registerUser invoked", { email: payload.email });
    // TODO: implement registration workflow (hash password, persist user, create wallet).
    return Promise.reject(new Error("registerUser not implemented"));
  }

  authenticateUser(payload: SignInInput): Promise<never> {
    logger.debug("authenticateUser invoked", { email: payload.email });
    // TODO: implement authentication workflow (verify credentials, issue tokens).
    return Promise.reject(new Error("authenticateUser not implemented"));
  }
}

export const authService = new AuthService();
