import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { authController } from "@/controllers/auth.controller";
import { signInSchema, signUpSchema } from "@/schemas/auth.schema";
import type { AppEnv } from "@/types/app";

const router = new Hono<AppEnv>();

router.post("/sign-up", zValidator("json", signUpSchema), (ctx) =>
  authController.signUp(ctx, ctx.req.valid("json"))
);

router.post("/sign-in", zValidator("json", signInSchema), (ctx) =>
  authController.signIn(ctx, ctx.req.valid("json"))
);

export { router as authRouter };
