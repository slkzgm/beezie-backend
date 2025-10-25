import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT private key is required'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT public key is required'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().min(32, 'Encryption key must be at least 32 characters'),
  FLOW_ACCESS_API: z.string().url(),
  FLOW_USDC_CONTRACT_ADDRESS: z
    .string()
    .length(42, 'USDC contract address must be a valid EVM-style address'),
  FLOW_NETWORK: z.enum(['testnet', 'mainnet-beta']).default('testnet'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  console.error('❌ Invalid environment configuration', formatted);
  throw new Error('Invalid environment variables');
}

const data = parsed.data;

export const env = {
  nodeEnv: data.NODE_ENV,
  server: {
    host: data.HOST,
    port: data.PORT,
  },
  db: {
    url: data.DATABASE_URL,
  },
  jwt: {
    privateKey: data.JWT_PRIVATE_KEY,
    publicKey: data.JWT_PUBLIC_KEY,
    accessTokenTtl: data.JWT_EXPIRES_IN,
    refreshTokenTtl: data.JWT_REFRESH_EXPIRES_IN,
  },
  crypto: {
    encryptionKey: data.ENCRYPTION_KEY,
  },
  flow: {
    accessApi: data.FLOW_ACCESS_API,
    usdcContractAddress: data.FLOW_USDC_CONTRACT_ADDRESS,
    network: data.FLOW_NETWORK,
  },
  logging: {
    level: data.LOG_LEVEL,
  },
} as const;
