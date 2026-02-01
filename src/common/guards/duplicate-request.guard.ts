
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

/**
 * DuplicateRequestGuard
 * 
 * Prevents clients from sending the exact same payload within a short time window.
 * Useful for preventing "double clicks" on critical actions like Payment or Reservation.
 */
@Injectable()
export class DuplicateRequestGuard implements CanActivate {
    private readonly logger = new Logger(DuplicateRequestGuard.name);
    // Window in milliseconds (e.g., 5000ms = 5 seconds)
    private readonly WINDOW_MS = 5000;

    constructor(
        // We inject the RedisService we already built
        @Inject(RedisService) private readonly redisService: RedisService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const { method, url, body, user, headers } = request;

        // Only check potentially destructive methods
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            return true;
        }

        // Identify the user or client IP
        // If we have an authenticated user, use their ID. Otherwise IP + UserAgent
        const userId = body.userId || headers['x-user-id'] || request.ip;

        if (!userId) {
            // Cannot reliably identify caller, likely skip or just use IP
            // For this challenge, we assume robust identity is handled or we use IP
        }

        // Create a hash of the critical data
        const payload = JSON.stringify(body || {});
        const hash = crypto
            .createHash('sha256')
            .update(`${userId}:${method}:${url}:${payload}`)
            .digest('hex');

        const cacheKey = `debounce:${hash}`;

        // Check if key exists in Redis
        // Note: Our RedisService uses IORedis client directly. 
        // We might need to use the native client to do a simple 'get'/'set' if acquireLock isn't what we want.
        // But acquireLock is essentially a SET NX. Let's use that! 
        // If we successfully acquire the lock, it means it's the first request in the window.

        const lock = await this.redisService.acquireLock(cacheKey, this.WINDOW_MS);

        if (!lock) {
            this.logger.warn(`Duplicate request detected for User/IP: ${userId} on ${url}`);
            throw new HttpException(
                'Duplicate request detected. Please wait a moment before retrying.',
                HttpStatus.TOO_MANY_REQUESTS
            );
        }

        // We don't release the lock. We let it expire. 
        // That effectively "blocks" duplicate calls for the duration of the TTL.
        return true;
    }
}
