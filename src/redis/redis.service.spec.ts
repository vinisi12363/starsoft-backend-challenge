import { Test, TestingModule } from '@nestjs/testing';
import { RedisService, Lock } from './redis.service';
import { ConfigService } from '@nestjs/config';

// Mock ioredis
const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    exists: jest.fn(),
    setex: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
};

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => mockRedisClient);
});

describe('RedisService', () => {
    let service: RedisService;

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RedisService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
                            if (key === 'REDIS_HOST') return 'localhost';
                            if (key === 'REDIS_PORT') return 6380;
                            return defaultValue;
                        }),
                    },
                },
            ],
        }).compile();

        service = module.get<RedisService>(RedisService);
    });

    afterEach(async () => {
        await service.onModuleDestroy();
    });

    describe('acquireLock', () => {
        it('should acquire lock successfully when key is available', async () => {
            mockRedisClient.set.mockResolvedValue('OK');

            const lock = await service.acquireLock('lock:seat:123', 5000);

            expect(lock).not.toBeNull();
            expect(lock!.key).toBe('lock:seat:123');
            expect(mockRedisClient.set).toHaveBeenCalledWith(
                'lock:seat:123',
                expect.any(String),
                'PX',
                5000,
                'NX',
            );
        });

        it('should return null when lock is already held', async () => {
            mockRedisClient.set.mockResolvedValue(null);

            const lock = await service.acquireLock('lock:seat:123', 5000);

            expect(lock).toBeNull();
        });

        it('should release lock successfully when owner', async () => {
            mockRedisClient.set.mockResolvedValue('OK');
            mockRedisClient.eval.mockResolvedValue(1);

            const lock = await service.acquireLock('lock:seat:123', 5000);
            const released = await lock!.release();

            expect(released).toBe(true);
        });
    });

    describe('acquireMultipleLocks', () => {
        it('should acquire multiple locks in sorted order', async () => {
            mockRedisClient.set.mockResolvedValue('OK');

            const keys = ['lock:seat:3', 'lock:seat:1', 'lock:seat:2'];
            const locks = await service.acquireMultipleLocks(keys, 5000);

            expect(locks).not.toBeNull();
            expect(locks!.length).toBe(3);

            // Should be acquired in sorted order
            expect(mockRedisClient.set.mock.calls[0][0]).toBe('lock:seat:1');
            expect(mockRedisClient.set.mock.calls[1][0]).toBe('lock:seat:2');
            expect(mockRedisClient.set.mock.calls[2][0]).toBe('lock:seat:3');
        });

        it('should release all acquired locks if one fails', async () => {
            // First two succeed, third fails
            mockRedisClient.set
                .mockResolvedValueOnce('OK')
                .mockResolvedValueOnce('OK')
                .mockResolvedValueOnce(null);
            mockRedisClient.eval.mockResolvedValue(1);

            const keys = ['lock:seat:1', 'lock:seat:2', 'lock:seat:3'];
            const locks = await service.acquireMultipleLocks(keys, 5000);

            expect(locks).toBeNull();
            // Should have tried to release the 2 successful locks
            expect(mockRedisClient.eval).toHaveBeenCalledTimes(2);
        });
    });

    describe('cache operations', () => {
        it('should set and get cached values', async () => {
            const testData = { foo: 'bar' };
            mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

            await service.set('cache:test', testData, 60);
            const result = await service.get<typeof testData>('cache:test');

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                'cache:test',
                60,
                JSON.stringify(testData),
            );
            expect(result).toEqual(testData);
        });

        it('should return null for non-existent key', async () => {
            mockRedisClient.get.mockResolvedValue(null);

            const result = await service.get('non:existent');

            expect(result).toBeNull();
        });
    });

    describe('isLocked', () => {
        it('should return true when key exists', async () => {
            mockRedisClient.exists.mockResolvedValue(1);

            const result = await service.isLocked('lock:seat:123');

            expect(result).toBe(true);
        });

        it('should return false when key does not exist', async () => {
            mockRedisClient.exists.mockResolvedValue(0);

            const result = await service.isLocked('lock:seat:123');

            expect(result).toBe(false);
        });
    });
});
