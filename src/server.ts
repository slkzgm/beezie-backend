import type { Hono } from 'hono';

import type { AppEnv } from '@/types/app';
import { createLogger, getActiveCorrelationId } from '@/utils/logger';

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

      const requestId = getActiveCorrelationId();
      const payload = {
        code: 'internal_error',
        message: 'Internal Server Error',
        ...(requestId ? { requestId } : {}),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (requestId) {
        headers['X-Request-ID'] = requestId;
      }

      return new Response(JSON.stringify(payload), {
        status: 500,
        headers,
      });
    },
  });

  logger.info('Server listening', {
    url: `http://${server.hostname}:${server.port}`,
  });

  return server;
};
