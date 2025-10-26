import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '@/types/app';
import type { RefreshInput, SignInInput, SignUpInput } from '@/schemas/auth.schema';
import { createLogger } from '@/utils/logger';
import { sendErrorResponse } from '@/utils/http';
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
      const safeError = error instanceof Error ? error : new Error('Unknown sign-up error');
      logger.error('Sign-up failed', safeError);
      const responseStatus: ContentfulStatusCode = safeError instanceof AuthError ? safeError.status : 500;
      const code = safeError instanceof AuthError ? safeError.code : 'internal_error';
      const message = safeError.message ?? 'Unable to complete sign up';
      return sendErrorResponse(ctx, responseStatus, code, message);
    }
  }

  async signIn(ctx: Context<AppEnv>, payload: SignInInput) {
    logger.debug('Sign-in request received', { email: payload.email });

    try {
      const db = ctx.get('db');
      const result = await authService.authenticateUser(db, payload);

      return ctx.json(result);
    } catch (error: unknown) {
      const safeError = error instanceof Error ? error : new Error('Unknown sign-in error');
      logger.error('Sign-in failed', safeError);
      const responseStatus: ContentfulStatusCode = safeError instanceof AuthError ? safeError.status : 500;
      const code = safeError instanceof AuthError ? safeError.code : 'internal_error';
      const message = safeError.message ?? 'Unable to sign in';
      return sendErrorResponse(ctx, responseStatus, code, message);
    }
  }

  async refresh(ctx: Context<AppEnv>, payload: RefreshInput) {
    logger.debug('Refresh request received');

    try {
      const db = ctx.get('db');
      const result = await authService.refreshSession(db, payload.refreshToken);
      return ctx.json(result);
    } catch (error: unknown) {
      const safeError = error instanceof Error ? error : new Error('Unknown refresh error');
      logger.error('Refresh failed', safeError);
      const responseStatus: ContentfulStatusCode = safeError instanceof AuthError ? safeError.status : 500;
      const code = safeError instanceof AuthError ? safeError.code : 'internal_error';
      const message = safeError.message ?? 'Unable to refresh session';
      return sendErrorResponse(ctx, responseStatus, code, message);
    }
  }
}

export const authController = new AuthController();
