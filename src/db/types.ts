import type { MySql2Database } from 'drizzle-orm/mysql2';
import type * as schema from '@/db/schema';

export type Database = MySql2Database<typeof schema>;
