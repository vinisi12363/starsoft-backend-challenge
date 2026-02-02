import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

/**
 * DuplicateRequestGuard
 * Prevenção para Double Booking, utilizando Redis para debounce de requisições e redis lock.
 */
@Injectable()
export class DuplicateRequestGuard implements CanActivate {
  private readonly logger = new Logger(DuplicateRequestGuard.name);
  private readonly WINDOW_MS = 5000;

  constructor(
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user, headers } = request;

    // Only check potentially destructive methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return true;
    }

  
    const userId = body.userId || headers['x-user-id'] || request.ip;


    // Create a hash of the critical data
    const payload = JSON.stringify(body || {});
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}:${method}:${url}:${payload}`)
      .digest('hex');

    const cacheKey = `debounce:${hash}`;


    const lock = await this.redisService.acquireLock(cacheKey, this.WINDOW_MS);

    if (!lock) {
      this.logger.warn(`Duplicate request detected for User/IP: ${userId} on ${url}`);
      throw new HttpException(
        'Duplicate request detected. Please wait a moment before retrying.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

  
    return true;
  }
}
