import { eq } from 'drizzle-orm';

import type { Database } from '@/db/types';
import { users } from '@/db/schema';
import { getInsertId } from '@/db/utils/mysql';

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;

export const createUser = async (db: Database, data: NewUserRecord) => {
  const result = await db.insert(users).values(data);
  const insertId = getInsertId(result);

  return insertId ? findUserById(db, insertId) : null;
};

export const findUserByEmail = async (db: Database, email: string) => {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
};

export const findUserById = async (db: Database, id: number) => {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
};

export const updateUserPassword = async (db: Database, id: number, passwordHash: string) => {
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  return findUserById(db, id);
};

export const updateUserDisplayName = async (
  db: Database,
  id: number,
  displayName: string | null,
) => {
  await db.update(users).set({ displayName }).where(eq(users.id, id));
  return findUserById(db, id);
};
