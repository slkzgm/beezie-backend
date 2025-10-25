import type { Database } from '@/db/types';

export type AppEnv = {
  Variables: {
    userId?: string;
    db: Database;
  };
  Bindings: Record<string, never>;
};
