import { eq } from "drizzle-orm";

import type { Database } from "@/db/types";
import { wallets } from "@/db/schema";
import { getInsertId } from "@/db/utils/mysql";

export type WalletRecord = typeof wallets.$inferSelect;
export type NewWalletRecord = typeof wallets.$inferInsert;

export const createWallet = async (db: Database, data: NewWalletRecord) => {
  const result = await db.insert(wallets).values(data);
  const insertId = getInsertId(result);

  if (insertId) {
    return findWalletById(db, insertId);
  }

  return findWalletByAddress(db, data.address);
};

export const findWalletById = async (db: Database, id: number) => {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id)).limit(1);
  return wallet ?? null;
};

export const findWalletByUserId = async (db: Database, userId: number) => {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return wallet ?? null;
};

export const findWalletByAddress = async (db: Database, address: string) => {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.address, address)).limit(1);
  return wallet ?? null;
};

export const updateEncryptedPrivateKey = async (
  db: Database,
  walletId: number,
  encryptedPrivateKey: string
) => {
  await db
    .update(wallets)
    .set({ encryptedPrivateKey })
    .where(eq(wallets.id, walletId));

  return findWalletById(db, walletId);
};
