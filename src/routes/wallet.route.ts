import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { walletController } from '@/controllers/wallet.controller';
import { authGuard } from '@/middlewares/auth.middleware';
import { transferSchema } from '@/schemas/wallet.schema';
import type { AppEnv } from '@/types/app';

const router = new Hono<AppEnv>();

router.use('*', authGuard);

router.post('/transfer', zValidator('json', transferSchema), (ctx) =>
  walletController.transfer(ctx, ctx.req.valid('json')),
);

export { router as walletRouter };
