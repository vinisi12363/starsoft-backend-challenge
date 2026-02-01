import { Test, type TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ReservationsRepository } from '../reservations/reservations.repository'; // Import missing repository
import { SalesRepository } from './sales.repository'; // Import missing repository
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReservationStatus, SeatStatus, Prisma } from '@prisma/client';

describe('SalesService', () => {
  let service: SalesService;
  let prismaService: jest.Mocked<PrismaService>;
  let kafkaService: jest.Mocked<KafkaService>;
  let reservationsRepository: jest.Mocked<ReservationsRepository>;
  let salesRepository: jest.Mocked<SalesRepository>;

  const mockSession = {
    id: 'session-1',
    movieTitle: 'Test Movie',
    startShowTime: new Date(), // Fixed field name
    endShowTime: new Date(), // Added missing field
    roomId: 'room-1', // Fixed field name
    ticketPrice: new Prisma.Decimal(25.0),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSeat = {
    id: 'seat-1',
    sessionId: 'session-1',
    rowLabel: 'A',
    seatNumber: 1,
    status: SeatStatus.RESERVED,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReservation = {
    id: 'reservation-1',
    userId: 'user-1',
    sessionId: 'session-1',
    expiresAt: new Date(Date.now() + 30000), // Not expired
    status: ReservationStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    reservationSeats: [
      {
        sessionSeat: {
          seat: mockSeat,
          id: 'session-seat-1',
          sessionId: 'session-1',
          status: SeatStatus.RESERVED,
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
    user: {
      id: 'user-1',
      name: 'Test',
      email: 'test@test.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(async () => {
    const prismaServiceMock = {
      reservation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      seat: {
        updateMany: jest.fn(),
      },
      sale: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prismaServiceMock)), // Mock transaction execution
      sessionSeat: {
        updateMany: jest.fn(),
      },
    };

    const kafkaServiceMock = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const reservationsRepositoryMock = {
      findById: jest.fn(),
    };

    const salesRepositoryMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: KafkaService, useValue: kafkaServiceMock },
        { provide: ReservationsRepository, useValue: reservationsRepositoryMock },
        { provide: SalesRepository, useValue: salesRepositoryMock },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    prismaService = module.get(PrismaService);
    kafkaService = module.get(KafkaService);
    reservationsRepository = module.get(ReservationsRepository);
    salesRepository = module.get(SalesRepository);
  });

  describe('confirmPayment', () => {
    it('should confirm payment and create sale for valid pending reservation', async () => {
      const mockSale = {
        id: 'sale-1',
        reservationId: 'reservation-1',
        userId: 'user-1',
        totalAmount: new Prisma.Decimal(25.0),
        confirmedAt: new Date(),
        createdAt: new Date(),
        reservation: mockReservation,
        user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
      };

      reservationsRepository.findById.mockResolvedValue(mockReservation);
      salesRepository.create.mockResolvedValue(mockSale);
      // prismaTransaction mock matches

      const result = await service.confirmPayment('reservation-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('sale-1');
      expect(kafkaService.emit).toHaveBeenCalledTimes(2); // Payment + Seat events
    });

    it('should throw NotFoundException when reservation does not exist', async () => {
      reservationsRepository.findById.mockResolvedValue(null);

      await expect(service.confirmPayment('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when reservation is not pending', async () => {
      const confirmedReservation = {
        ...mockReservation,
        status: ReservationStatus.CONFIRMED,
      };

      reservationsRepository.findById.mockResolvedValue(confirmedReservation);

      await expect(service.confirmPayment('reservation-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when reservation is expired', async () => {
      const expiredReservation = {
        ...mockReservation,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      };

      reservationsRepository.findById.mockResolvedValue(expiredReservation);

      await expect(service.confirmPayment('reservation-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('should return sale when found', async () => {
      const mockSale = {
        id: 'sale-1',
        reservationId: 'reservation-1',
        userId: 'user-1',
        totalAmount: new Prisma.Decimal(25.0),
        confirmedAt: new Date(),
        createdAt: new Date(),
        reservation: mockReservation,
        user: mockReservation.user,
      };

      salesRepository.findById.mockResolvedValue(mockSale);

      const result = await service.findById('sale-1');

      expect(result).toEqual(mockSale);
    });

    it('should throw NotFoundException when sale not found', async () => {
      salesRepository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
