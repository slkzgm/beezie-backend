import type { Database } from '@/db/types';

export type AppEnv = {
  Variables: {
    userId?: string;
    db: Database;
    correlationId?: string;
  };
  Bindings: Record<string, never>;
};
