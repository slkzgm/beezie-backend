import { createApp } from '@/app';
import { createServer } from '@/server';
import { env } from '@/config/env';

const app = createApp();

const { port, host } = env.server;

createServer(app, { port, hostname: host });
