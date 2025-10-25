import { createLogger } from '@/utils/logger';

const logger = createLogger('user-service');

export class UserService {
  createUser(): Promise<never> {
    logger.debug('createUser invoked');
    // TODO: implement user persistence via Drizzle.
    return Promise.reject(new Error('createUser not implemented'));
  }

  findByEmail(): Promise<never> {
    logger.debug('findByEmail invoked');
    // TODO: query user by email using Drizzle.
    return Promise.reject(new Error('findByEmail not implemented'));
  }
}

export const userService = new UserService();
