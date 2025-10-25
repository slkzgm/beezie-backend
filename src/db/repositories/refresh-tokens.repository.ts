import { eq } from "drizzle-orm";

import type { Database } from "@/db/types";
import { refreshTokens } from "@/db/schema";
import { getAffectedRows } from "@/db/utils/mysql";

export type RefreshTokenRecord = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRecord = typeof refreshTokens.$inferInsert;

export const createRefreshToken = async (
  db: Database,
  data: NewRefreshTokenRecord
): Promise<RefreshTokenRecord | null> => {
  await db.insert(refreshTokens).values(data);
  return findRefreshTokenByToken(db, data.token);
};

export const findRefreshTokenByToken = async (
  db: Database,
  token: string
): Promise<RefreshTokenRecord | null> => {
  const [refreshToken] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, token))
    .limit(1);

  return refreshToken ?? null;
};

export const deleteRefreshToken = async (db: Database, token: string): Promise<boolean> => {
  const result = await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  return getAffectedRows(result) > 0;
};

export const deleteRefreshTokensByUserId = async (
  db: Database,
  userId: number
): Promise<number> => {
  const result = await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  return getAffectedRows(result);
};
