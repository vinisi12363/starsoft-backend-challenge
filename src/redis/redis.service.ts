import { Injectable, type OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface Lock {
  key: string;
  value: string;
  release: () => Promise<boolean>;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly lockScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6380),
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis');
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Adquire um lock distribuído para um recurso
   * @param key - Chave do lock (ex: "lock:seat:123")
   * @param ttlMs - Tempo de vida do lock em milissegundos
   * @returns Lock object ou null se não conseguiu adquirir
   */
  async acquireLock(key: string, ttlMs: number): Promise<Lock | null> {
    const value = uuidv4();
    const result = await this.client.set(key, value, 'PX', ttlMs, 'NX');

    if (result === 'OK') {
      this.logger.debug(`Lock acquired: ${key}`);
      return {
        key,
        value,
        release: async () => this.releaseLock(key, value),
      };
    }

    this.logger.debug(`Failed to acquire lock: ${key}`);
    return null;
  }

  /**
   * Libera um lock distribuído
   * @param key - Chave do lock
   * @param value - Valor do lock (para garantir que apenas quem criou pode liberar)
   */
  async releaseLock(key: string, value: string): Promise<boolean> {
    const result = await this.client.eval(this.lockScript, 1, key, value);
    const released = result === 1;

    if (released) {
      this.logger.debug(`Lock released: ${key}`);
    } else {
      this.logger.warn(`Failed to release lock (not owner or expired): ${key}`);
    }

    return released;
  }

  /**
   * Adquire múltiplos locks em ordem (para evitar deadlock)
   * @param keys - Array de chaves para adquirir locks
   * @param ttlMs - Tempo de vida dos locks em milissegundos
   * @returns Array de locks adquiridos ou null se falhou
   */
  async acquireMultipleLocks(keys: string[], ttlMs: number): Promise<Lock[] | null> {
    // Ordenar keys para evitar deadlock
    const sortedKeys = [...keys].sort();
    const acquiredLocks: Lock[] = [];

    for (const key of sortedKeys) {
      const lock = await this.acquireLock(key, ttlMs);

      if (!lock) {
        // Falhou em adquirir um lock, libera todos os anteriores
        this.logger.warn(
          `Failed to acquire lock for ${key}, releasing ${acquiredLocks.length} previous locks`,
        );

        for (const acquiredLock of acquiredLocks) {
          await acquiredLock.release();
        }

        return null;
      }

      acquiredLocks.push(lock);
    }

    return acquiredLocks;
  }

  /**
   * Libera múltiplos locks
   * @param locks - Array de locks para liberar
   */
  async releaseMultipleLocks(locks: Lock[]): Promise<void> {
    for (const lock of locks) {
      await lock.release();
    }
  }

  /**
   * Verifica se um lock existe
   */
  async isLocked(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Cache get
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * Cache set com TTL
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
