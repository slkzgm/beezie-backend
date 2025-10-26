import { generateKeyPairSync } from 'crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.HOST = process.env.HOST ?? '127.0.0.1';
process.env.PORT = process.env.PORT ?? '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'mysql://user:pass@localhost:3306/beezie_test';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.FLOW_ACCESS_API = process.env.FLOW_ACCESS_API ?? 'http://localhost:8545';
process.env.FLOW_USDC_CONTRACT_ADDRESS =
  process.env.FLOW_USDC_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000000001';
process.env.FLOW_NETWORK = process.env.FLOW_NETWORK ?? 'testnet';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;
