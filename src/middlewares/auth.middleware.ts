import type { Context, Next } from "hono";

import type { AppEnv } from "@/types/app";
import { tokenService } from "@/services/token.service";

export const authGuard = async (ctx: Context<AppEnv>, next: Next) => {
  const authorization = ctx.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice("Bearer ".length);
  const payload = await tokenService.verifyAccessToken(token);

  if (!payload?.sub) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  ctx.set("userId", payload.sub);

  await next();
};
