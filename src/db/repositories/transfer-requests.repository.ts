import { and, eq } from 'drizzle-orm';

import type { Database } from '@/db/types';
import { transferRequests } from '@/db/schema';

export type TransferRequestRecord = typeof transferRequests.$inferSelect;
export type NewTransferRequestRecord = typeof transferRequests.$inferInsert;
export type UpdateTransferRequestRecord = Partial<
  Pick<TransferRequestRecord, 'transactionHash' | 'status'>
>;

export const findByUserAndKeyHash = async (
  db: Database,
  userId: number,
  keyHash: string,
): Promise<TransferRequestRecord | null> => {
  const rows: TransferRequestRecord[] = await db
    .select()
    .from(transferRequests)
    .where(
      and(eq(transferRequests.userId, userId), eq(transferRequests.idempotencyKeyHash, keyHash)),
    )
    .limit(1);

  return rows[0] ?? null;
};

export const createTransferRequest = async (
  db: Database,
  data: NewTransferRequestRecord,
): Promise<TransferRequestRecord | null> => {
  await db.insert(transferRequests).values(data);
  return findByUserAndKeyHash(db, data.userId, data.idempotencyKeyHash);
};

export const updateTransferRequest = async (
  db: Database,
  id: number,
  data: UpdateTransferRequestRecord,
): Promise<void> => {
  await db.update(transferRequests).set(data).where(eq(transferRequests.id, id));
};

export const deleteTransferRequestById = async (db: Database, id: number): Promise<void> => {
  await db.delete(transferRequests).where(eq(transferRequests.id, id));
};
