import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '@/db/types';
import { refreshTokens } from '@/db/schema';
import { getAffectedRows } from '@/db/utils/mysql';

export type RefreshTokenRecord = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRecord = typeof refreshTokens.$inferInsert;

export const createRefreshToken = async (
  db: Database,
  data: NewRefreshTokenRecord,
): Promise<RefreshTokenRecord | null> => {
  await db.insert(refreshTokens).values(data);
  return findRefreshTokenByHash(db, data.tokenHash);
};

export const markRefreshTokensRotatedForUser = async (
  db: Database,
  userId: number,
  rotatedAt: Date,
) => {
  await db
    .update(refreshTokens)
    .set({ rotatedAt })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.rotatedAt)));
};

export const markRefreshTokenReused = async (db: Database, tokenHash: string, reusedAt: Date) => {
  await db
    .update(refreshTokens)
    .set({ reusedAt, rotatedAt: reusedAt })
    .where(eq(refreshTokens.tokenHash, tokenHash));
};

export const findRefreshTokenByHash = async (
  db: Database,
  tokenHash: string,
): Promise<RefreshTokenRecord | null> => {
  const [refreshToken] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  return refreshToken ?? null;
};

export const deleteRefreshToken = async (db: Database, tokenHash: string): Promise<boolean> => {
  const result = await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  return getAffectedRows(result) > 0;
};

export const deleteRefreshTokensByUserId = async (
  db: Database,
  userId: number,
): Promise<number> => {
  const result = await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  return getAffectedRows(result);
};
