import type { Database } from '@/db/types';

type TransactionType = Parameters<Database['transaction']>[0] extends (
  tx: infer TX,
  ...args: unknown[]
) => Promise<unknown>
  ? TX
  : never;

export type Transaction = TransactionType;

export const withTransaction = async <T>(
  db: Database,
  handler: (tx: TransactionType) => Promise<T>,
): Promise<T> => {
  return db.transaction((tx) => handler(tx as TransactionType));
};
