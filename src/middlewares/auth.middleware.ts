import type { Context, Next } from 'hono';

import type { AppEnv } from '@/types/app';
import { tokenService } from '@/services/token.service';
import { sendErrorResponse } from '@/utils/http';

export const authGuard = async (ctx: Context<AppEnv>, next: Next) => {
  const authorization = ctx.req.header('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    ctx.header('WWW-Authenticate', 'Bearer error="invalid_request"');
    return sendErrorResponse(
      ctx,
      401,
      'authorization_header_invalid',
      'Authorization header missing or malformed',
    );
  }

  const token = authorization.slice('Bearer '.length);

  const payload = await tokenService.verifyAccessToken(token);

  if (!payload?.sub) {
    ctx.header('WWW-Authenticate', 'Bearer error="invalid_token"');
    return sendErrorResponse(ctx, 401, 'invalid_access_token', 'Invalid or expired access token');
  }

  ctx.set('userId', payload.sub);

  await next();
};
