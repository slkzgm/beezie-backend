import bcrypt from 'bcryptjs';

import { createLogger } from '@/utils/logger';

const logger = createLogger('password');

const SALT_ROUNDS = 12;

export const hashPassword = async (plainPassword: string): Promise<string> => {
  if (!plainPassword) {
    throw new Error('Password cannot be empty');
  }

  try {
    return await bcrypt.hash(plainPassword, SALT_ROUNDS);
  } catch (error) {
    logger.error('Failed to hash password', error);
    throw new Error('Unable to hash password');
  }
};

export const verifyPassword = async (
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> => {
  if (!plainPassword || !passwordHash) {
    return false;
  }

  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch (error) {
    logger.error('Failed to verify password', error);
    return false;
  }
};
