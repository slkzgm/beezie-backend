import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { authRouter } from '@/routes/auth.route';
import { walletRouter } from '@/routes/wallet.route';
import { getDb } from '@/db/client';
import type { AppEnv } from '@/types/app';
import { env } from '@/config/env';

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use('*', logger());
  app.use('*', compress());
  app.use('*', secureHeaders());

  const allowedOrigins = env.http.corsAllowedOrigins;
  app.use(
    '*',
    cors({
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      credentials: allowedOrigins.includes('*') ? false : true,
    }),
  );

  app.use('*', async (ctx, next) => {
    const { db } = getDb();
    ctx.set('db', db);
    await next();
  });

  app.get('/health', (ctx) =>
    ctx.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  );

  app.route('/auth', authRouter);
  app.route('/wallet', walletRouter);

  app.notFound((ctx) =>
    ctx.json(
      {
        error: 'Not Found',
      },
      404,
    ),
  );

  return app;
};
