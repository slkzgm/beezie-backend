import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '@/types/app';
import type { RefreshInput, SignInInput, SignUpInput } from '@/schemas/auth.schema';
import { createLogger } from '@/utils/logger';
import { authService, AuthError } from '@/services/auth.service';

const logger = createLogger('auth-controller');

export class AuthController {
  async signUp(ctx: Context<AppEnv>, payload: SignUpInput) {
    logger.debug('Sign-up request received', { email: payload.email });

    try {
      const db = ctx.get('db');
      const result = await authService.registerUser(db, payload);
      return ctx.json(result, 201);
    } catch (error: unknown) {
      logger.error('Sign-up failed', error instanceof Error ? error : { error });
      const responseStatus: ContentfulStatusCode = error instanceof AuthError ? error.status : 500;
      ctx.status(responseStatus);
      return ctx.json({
        message: error instanceof Error ? error.message : 'Unable to complete sign up',
      });
    }
  }

  async signIn(ctx: Context<AppEnv>, payload: SignInInput) {
    logger.debug('Sign-in request received', { email: payload.email });

    try {
      const db = ctx.get('db');
      const result = await authService.authenticateUser(db, payload);

      return ctx.json(result);
    } catch (error: unknown) {
      logger.error('Sign-in failed', error instanceof Error ? error : { error });
      const responseStatus: ContentfulStatusCode = error instanceof AuthError ? error.status : 500;
      ctx.status(responseStatus);
      return ctx.json({
        message: error instanceof Error ? error.message : 'Unable to sign in',
      });
    }
  }

  async refresh(ctx: Context<AppEnv>, payload: RefreshInput) {
    logger.debug('Refresh request received');

    try {
      const db = ctx.get('db');
      const result = await authService.refreshSession(db, payload.refreshToken);
      return ctx.json(result);
    } catch (error: unknown) {
      logger.error('Refresh failed', error instanceof Error ? error : { error });
      const responseStatus: ContentfulStatusCode = error instanceof AuthError ? error.status : 500;
      ctx.status(responseStatus);
      return ctx.json({
        message: error instanceof Error ? error.message : 'Unable to refresh session',
      });
    }
  }
}

export const authController = new AuthController();
