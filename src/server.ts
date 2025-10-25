import type { Hono } from 'hono';

import type { AppEnv } from '@/types/app';
import { createLogger } from '@/utils/logger';

type ServerOptions = {
  port: number;
  hostname: string;
};

const logger = createLogger('server');

export const createServer = (app: Hono<AppEnv>, options: ServerOptions) => {
  const server = Bun.serve({
    port: options.port,
    hostname: options.hostname,
    fetch: app.fetch,
    error(error) {
      logger.error('Unhandled error', { error });

      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  logger.info('Server listening', {
    url: `http://${server.hostname}:${server.port}`,
  });

  return server;
};
