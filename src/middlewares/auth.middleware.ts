import type { Context, Next } from "hono";

import type { AppEnv } from "@/types/app";
import { tokenService } from "@/services/token.service";

export const authGuard = async (ctx: Context<AppEnv>, next: Next) => {
  const authorization = ctx.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    ctx.status(401);
    return ctx.json({ error: "Authorization header missing or malformed" });
  }

  const token = authorization.slice("Bearer ".length);

  const payload = await tokenService.verifyAccessToken(token);

  if (!payload?.sub) {
    ctx.status(401);
    return ctx.json({ error: "Invalid or expired access token" });
  }

  ctx.set("userId", payload.sub);

  await next();
};
