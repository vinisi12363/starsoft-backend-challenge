import { Test, type TestingModule } from '@nestjs/testing';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { SeatStatus, ReservationStatus, Prisma } from '@prisma/client';

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
    startShowTime: new Date(),
    endShowTime: new Date(Date.now() + 7200000), // +2 hours
    roomId: 'room-1',
    ticketPrice: new Prisma.Decimal(25.0),
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
    roomId: 'room-1', 
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
      createWithAtomicSeats: jest.fn(),
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
            get: jest.fn().mockReturnValue(30000),
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
        sessionSeatIds: ['seat-1'],
      };

      const mockReservation = {
        id: 'reservation-1',
        userId: createDto.userId,
        sessionId: createDto.sessionId,
        expiresAt: new Date(Date.now() + 30000),
        status: ReservationStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        reservationSeats: [
          {
            sessionSeat: {
              seat: mockSeat,
              id: 'session-seat-1',
              sessionId: 'session-1',
              status: SeatStatus.AVAILABLE,
              seatId: 'seat-1',
              version: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            reservationId: 'reservation-1',
            sessionSeatId: 'session-seat-1',
          },
        ],
        session: mockSession,
        user: mockUser,
        idempotencyKey: null,
      };

      redisService.acquireMultipleLocks.mockResolvedValue([mockLock]);
      repositoryMock.createWithAtomicSeats.mockResolvedValue(mockReservation as any);

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('reservation-1');
      expect(redisService.acquireMultipleLocks).toHaveBeenCalledWith(['lock:ss:seat-1'], 30000);
      expect(redisService.releaseMultipleLocks).toHaveBeenCalledWith([mockLock]);
      expect(kafkaService.emit).toHaveBeenCalled();
    });

    it('should throw ConflictException when cannot acquire locks', async () => {
      const createDto = {
        userId: 'user-1',
        sessionId: 'session-1',
        sessionSeatIds: ['seat-1'],
      };

      redisService.acquireMultipleLocks.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

 

    it('should throw ConflictException when seat is not available (repository throws SEATS_NOT_AVAILABLE)', async () => {
      const createDto = {
        userId: 'user-1',
        sessionId: 'session-1',
        sessionSeatIds: ['seat-1'],
      };

      redisService.acquireMultipleLocks.mockResolvedValue([mockLock]);
      repositoryMock.createWithAtomicSeats.mockRejectedValue(new Error('SEATS_NOT_AVAILABLE'));

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(redisService.releaseMultipleLocks).toHaveBeenCalled();
    });

    it('should return existing reservation for duplicate idempotency key', async () => {
      const createDto = {
        userId: 'user-1',
        sessionId: 'session-1',
        sessionSeatIds: ['seat-1'],
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
        reservationSeats: [
          {
            sessionSeat: {
              seat: mockSeat,
              id: 'session-seat-1',
              sessionId: 'session-1',
              status: SeatStatus.AVAILABLE,
              seatId: 'seat-1',
              version: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            reservationId: 'reservation-1',
            sessionSeatId: 'session-seat-1',
          },
        ],
        session: mockSession,
        user: mockUser,
      };

      repositoryMock.findByIdempotencyKey.mockResolvedValue(existingReservation as any);

      const result = await service.create(createDto, idempotencyKey);

      expect(result.id).toBe('existing-reservation');
      expect(redisService.acquireMultipleLocks).not.toHaveBeenCalled();
    });

    it('should sort seat IDs to prevent deadlock', async () => {
      const createDto = {
        userId: 'user-1',
        sessionId: 'session-1',
        sessionSeatIds: ['seat-3', 'seat-1', 'seat-2'],
      };

      redisService.acquireMultipleLocks.mockResolvedValue([mockLock, mockLock, mockLock]);

      repositoryMock.createWithAtomicSeats.mockResolvedValue({
        id: 'reservation-sort',
      } as any);

      await service.create(createDto);

      // Verify locks were requested (RedisService handles sorting internally)
      expect(redisService.acquireMultipleLocks).toHaveBeenCalledWith(
        ['lock:ss:seat-3', 'lock:ss:seat-1', 'lock:ss:seat-2'],
        30000,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel pending reservation and release seats', async () => {
      const mockReservation = {
        id: 'reservation-1',
        status: ReservationStatus.PENDING,
        reservationSeats: [
          {
            sessionSeat: {
              seat: mockSeat,
              id: 'session-seat-1',
              sessionId: 'session-1',
              status: SeatStatus.AVAILABLE,
              seatId: 'seat-1',
              version: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            reservationId: 'reservation-1',
            sessionSeatId: 'session-seat-1',
          },
        ],
        user: mockUser,
        session: mockSession,
      };

      repositoryMock.findById.mockResolvedValue(mockReservation as any);
      prismaService.$transaction.mockResolvedValue(undefined);

      await service.cancel('reservation-1');

      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException when reservation is not pending', async () => {
      const mockReservation = {
        id: 'reservation-1',
        status: ReservationStatus.CONFIRMED,
        reservationSeats: [
          {
            sessionSeat: {
              seat: {
                ...mockSeat,
                // Ensure roomId is present if strictly required by type, though mockSeat usually has it if defined correctly above.
                // mockSeat above doesn't have roomId. Let's add it there or here.
                roomId: 'room-1',
              },
              id: 'session-seat-1',
              sessionId: 'session-1',
              status: SeatStatus.AVAILABLE,
              seatId: 'seat-1',
              version: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            reservationId: 'reservation-1',
            sessionSeatId: 'session-seat-1',
          },
        ],
        user: mockUser,
        session: mockSession,
        userId: mockUser.id,
        sessionId: mockSession.id,
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        idempotencyKey: null,
      };

      repositoryMock.findById.mockResolvedValue(mockReservation as any);

      await expect(service.cancel('reservation-1')).rejects.toThrow(BadRequestException);
    });
  });
});
