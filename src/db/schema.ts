import {
  datetime,
  index,
  int,
  mysqlTable,
  serial,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email)
  })
);

export const wallets = mysqlTable(
  "wallets",
  {
    id: serial("id").primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 42 }).notNull(),
    encryptedPrivateKey: varchar("encrypted_private_key", { length: 512 }).notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    addressIdx: uniqueIndex("wallets_address_idx").on(table.address),
    userIdx: index("wallets_user_idx").on(table.userId)
  })
);

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: serial("id").primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 512 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => ({
    tokenIdx: uniqueIndex("refresh_tokens_token_idx").on(table.token),
    userIdx: index("refresh_tokens_user_idx").on(table.userId)
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
