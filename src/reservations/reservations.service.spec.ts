import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SeatStatus, ReservationStatus } from '@prisma/client';

describe('ReservationsService', () => {
    let service: ReservationsService;
    let prismaService: jest.Mocked<PrismaService>;
    let repositoryMock: jest.Mocked<ReservationsRepository>;
    let redisService: jest.Mocked<RedisService>;
    let kafkaService: jest.Mocked<KafkaService>;

    const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockSession = {
        id: 'session-1',
        movieTitle: 'Test Movie',
        showTime: new Date(),
        roomName: 'Sala 1',
        ticketPrice: 25.0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockSeat = {
        id: 'seat-1',
        sessionId: 'session-1',
        rowLabel: 'A',
        seatNumber: 1,
        status: SeatStatus.AVAILABLE,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockLock = {
        key: 'lock:seat:seat-1',
        value: 'lock-value',
        release: jest.fn().mockResolvedValue(true),
    };

    beforeEach(async () => {
        const prismaServiceMock = {
            user: {
                findUnique: jest.fn(),
            },
            session: {
                findUnique: jest.fn(),
            },
            seat: {
                findMany: jest.fn(),
                updateMany: jest.fn(),
            },
            reservation: {
                create: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            $transaction: jest.fn(),
        };

        const repositoryMockValue = {
            findById: jest.fn(),
            findByIdempotencyKey: jest.fn(),
            findExpired: jest.fn(),
            findByUserId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        };

        const redisServiceMock = {
            acquireMultipleLocks: jest.fn(),
            releaseMultipleLocks: jest.fn(),
        };

        const kafkaServiceMock = {
            emit: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReservationsService,
                { provide: PrismaService, useValue: prismaServiceMock },
                { provide: ReservationsRepository, useValue: repositoryMockValue },
                { provide: RedisService, useValue: redisServiceMock },
                { provide: KafkaService, useValue: kafkaServiceMock },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue(30),
                    },
                },
            ],
        }).compile();

        service = module.get<ReservationsService>(ReservationsService);
        prismaService = module.get(PrismaService);
        repositoryMock = module.get(ReservationsRepository);
        redisService = module.get(RedisService);
        kafkaService = module.get(KafkaService);
    });

    describe('create', () => {
        it('should create reservation when seats are available', async () => {
            const createDto = {
                userId: 'user-1',
                sessionId: 'session-1',
                seatIds: ['seat-1'],
            };

            const mockReservation = {
                id: 'reservation-1',
                userId: createDto.userId,
                sessionId: createDto.sessionId,
                expiresAt: new Date(Date.now() + 30000),
                status: ReservationStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
                reservationSeats: [{ seat: mockSeat }],
                session: mockSession,
                user: mockUser,
            };

            redisService.acquireMultipleLocks.mockResolvedValue([mockLock]);
            prismaService.user.findUnique.mockResolvedValue(mockUser);
            prismaService.session.findUnique.mockResolvedValue(mockSession);
            prismaService.seat.findMany.mockResolvedValue([mockSeat]);
            prismaService.$transaction.mockResolvedValue(mockReservation);

            const result = await service.create(createDto);

            expect(result).toBeDefined();
            expect(result.id).toBe('reservation-1');
            expect(redisService.acquireMultipleLocks).toHaveBeenCalledWith(
                ['lock:seat:seat-1'],
                5000,
            );
            expect(redisService.releaseMultipleLocks).toHaveBeenCalledWith([mockLock]);
            expect(kafkaService.emit).toHaveBeenCalled();
        });

        it('should throw ConflictException when cannot acquire locks', async () => {
            const createDto = {
                userId: 'user-1',
                sessionId: 'session-1',
                seatIds: ['seat-1'],
            };

            redisService.acquireMultipleLocks.mockResolvedValue(null);

            await expect(service.create(createDto)).rejects.toThrow(ConflictException);
        });

        it('should throw NotFoundException when user does not exist', async () => {
            const createDto = {
                userId: 'non-existent',
                sessionId: 'session-1',
                seatIds: ['seat-1'],
            };

            redisService.acquireMultipleLocks.mockResolvedValue([mockLock]);
            prismaService.user.findUnique.mockResolvedValue(null);

            await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
            expect(redisService.releaseMultipleLocks).toHaveBeenCalled();
        });

        it('should throw ConflictException when seat is not available', async () => {
            const createDto = {
                userId: 'user-1',
                sessionId: 'session-1',
                seatIds: ['seat-1'],
            };

            const reservedSeat = { ...mockSeat, status: SeatStatus.RESERVED };

            redisService.acquireMultipleLocks.mockResolvedValue([mockLock]);
            prismaService.user.findUnique.mockResolvedValue(mockUser);
            prismaService.session.findUnique.mockResolvedValue(mockSession);
            prismaService.seat.findMany.mockResolvedValue([reservedSeat]);

            await expect(service.create(createDto)).rejects.toThrow(ConflictException);
            expect(redisService.releaseMultipleLocks).toHaveBeenCalled();
        });

        it('should return existing reservation for duplicate idempotency key', async () => {
            const createDto = {
                userId: 'user-1',
                sessionId: 'session-1',
                seatIds: ['seat-1'],
            };
            const idempotencyKey = 'unique-key';

            const existingReservation = {
                id: 'existing-reservation',
                userId: createDto.userId,
                sessionId: createDto.sessionId,
                expiresAt: new Date(Date.now() + 30000),
                status: ReservationStatus.PENDING,
                createdAt: new Date(),
                updatedAt: new Date(),
                idempotencyKey,
                reservationSeats: [{ seat: mockSeat }],
                session: mockSession,
                user: mockUser,
            };

            repositoryMock.findByIdempotencyKey.mockResolvedValue(existingReservation);

            const result = await service.create(createDto, idempotencyKey);

            expect(result.id).toBe('existing-reservation');
            expect(redisService.acquireMultipleLocks).not.toHaveBeenCalled();
        });

        it('should sort seat IDs to prevent deadlock', async () => {
            const createDto = {
                userId: 'user-1',
                sessionId: 'session-1',
                seatIds: ['seat-3', 'seat-1', 'seat-2'],
            };

            const mockSeats = [
                { ...mockSeat, id: 'seat-1' },
                { ...mockSeat, id: 'seat-2' },
                { ...mockSeat, id: 'seat-3' },
            ];

            redisService.acquireMultipleLocks.mockResolvedValue([mockLock, mockLock, mockLock]);
            prismaService.user.findUnique.mockResolvedValue(mockUser);
            prismaService.session.findUnique.mockResolvedValue(mockSession);
            prismaService.seat.findMany.mockResolvedValue(mockSeats);
            prismaService.$transaction.mockResolvedValue({
                id: 'reservation-1',
                reservationSeats: mockSeats.map((s) => ({ seat: s })),
                session: mockSession,
                user: mockUser,
                expiresAt: new Date(),
                createdAt: new Date(),
            });

            await service.create(createDto);

            // Verify locks were requested in sorted order
            expect(redisService.acquireMultipleLocks).toHaveBeenCalledWith(
                ['lock:seat:seat-1', 'lock:seat:seat-2', 'lock:seat:seat-3'],
                5000,
            );
        });
    });

    describe('cancel', () => {
        it('should cancel pending reservation and release seats', async () => {
            const mockReservation = {
                id: 'reservation-1',
                status: ReservationStatus.PENDING,
                reservationSeats: [{ seat: mockSeat }],
            };

            repositoryMock.findById.mockResolvedValue(mockReservation);
            prismaService.$transaction.mockResolvedValue(undefined);

            await service.cancel('reservation-1');

            expect(prismaService.$transaction).toHaveBeenCalled();
        });

        it('should throw BadRequestException when reservation is not pending', async () => {
            const mockReservation = {
                id: 'reservation-1',
                status: ReservationStatus.CONFIRMED,
                reservationSeats: [{ seat: mockSeat }],
            };

            repositoryMock.findById.mockResolvedValue(mockReservation);

            await expect(service.cancel('reservation-1')).rejects.toThrow(
                BadRequestException,
            );
        });
    });
});
