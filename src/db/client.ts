import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';

import { env } from '@/config/env';
import { createLogger } from '@/utils/logger';
import type { Database } from '@/db/types';

const logger = createLogger('db-client');

let pool: mysql.Pool | undefined;
let database: Database | undefined;

export const getDb = () => {
  if (!pool) {
    logger.info('Creating MySQL connection pool');
    pool = mysql.createPool({
      uri: env.db.url,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  if (!database) {
    database = drizzle(pool);
  }

  return { pool, db: database } as const;
};
