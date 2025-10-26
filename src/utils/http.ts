import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppEnv } from '@/types/app';

export type ErrorResponsePayload = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

export const sendErrorResponse = (
  ctx: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) => {
  const requestId = ctx.get('correlationId');
  ctx.status(status);
  const payload: ErrorResponsePayload = {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
    ...(requestId ? { requestId } : {}),
  };
  return ctx.json(payload);
};
