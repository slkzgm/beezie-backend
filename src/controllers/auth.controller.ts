import type { Context } from "hono";

import type { AppEnv } from "@/types/app";
import type { SignInInput, SignUpInput } from "@/schemas/auth.schema";
import { createLogger } from "@/utils/logger";
import { authService } from "@/services/auth.service";

const logger = createLogger("auth-controller");

export class AuthController {
  async signUp(ctx: Context<AppEnv>, payload: SignUpInput) {

    logger.debug("Sign-up request received", { email: payload.email });

    try {
      await authService.registerUser(payload);
      return ctx.json(
        {
          message: "Sign up completed"
        },
        201
      );
    } catch (error) {
      logger.error("Sign-up not implemented", error);
      return ctx.json(
        {
          message: "Sign up not implemented yet"
        },
        501
      );
    }
  }

  async signIn(ctx: Context<AppEnv>, payload: SignInInput) {

    logger.debug("Sign-in request received", { email: payload.email });

    try {
      await authService.authenticateUser(payload);

      return ctx.json({
        message: "Sign in completed"
      });
    } catch (error) {
      logger.error("Sign-in not implemented", error);
      return ctx.json(
        {
          message: "Sign in not implemented yet"
        },
        501
      );
    }
  }
}

export const authController = new AuthController();
