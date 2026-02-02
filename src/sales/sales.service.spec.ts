import { Test, type TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';

import { KafkaService } from '../kafka/kafka.service';
import { ReservationsRepository } from '../reservations/reservations.repository'; 
import { SalesRepository } from './sales.repository';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReservationStatus, SeatStatus, Prisma } from '@prisma/client';

describe('SalesService', () => {
  let service: SalesService;
  let kafkaService: jest.Mocked<KafkaService>;
  let reservationsRepository: jest.Mocked<ReservationsRepository>;
  let salesRepository: jest.Mocked<SalesRepository>;

  const mockSession = {
    id: 'session-1',
    movieTitle: 'Test Movie',
    startShowTime: new Date(), 
    endShowTime: new Date(), 
    roomId: 'room-1', 
    ticketPrice: new Prisma.Decimal(25.0),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSeat = {
    id: 'seat-1',
    roomId: 'room-1',
    rowLabel: 'A',
    seatNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReservation = {
    id: 'reservation-1',
    userId: 'user-1',
    sessionId: 'session-1',
    expiresAt: new Date(Date.now() + 30000),
    status: ReservationStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    idempotencyKey: 'key-1',
    reservationSeats: [
      {
        id: 'reservation-seat-1',
        sessionSeat: {
          seat: {
            id: 'seat-1',
            roomId: 'room-1',
            rowLabel: 'A',
            seatNumber: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          id: 'session-seat-1',
          sessionId: 'session-1',
          status: SeatStatus.RESERVED,
          seatId: 'seat-1',
          version: 0,
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


    const kafkaServiceMock = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const reservationsRepositoryMock = {
      findById: jest.fn(),
    };

    const salesRepositoryMock = {
      createSaleTransaction: jest.fn(),
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        SalesService,
        { provide: KafkaService, useValue: kafkaServiceMock },
        { provide: ReservationsRepository, useValue: reservationsRepositoryMock },
        { provide: SalesRepository, useValue: salesRepositoryMock },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
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
        user: {
          id: 'user-1',
          name: 'Test',
          email: 'test@test.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };


      reservationsRepository.findById.mockResolvedValue(mockReservation);
      salesRepository.createSaleTransaction.mockResolvedValue(mockSale);
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

    // CENÁRIO FALHA: Retornar erro 400 se a reserva expirou
    it('should throw BadRequestException when reservation is expired (30s timeout exceeded)', async () => {
      const expiredReservation = {
        ...mockReservation,
        expiresAt: new Date(Date.now() - 1000), 
      };

      reservationsRepository.findById.mockResolvedValue(expiredReservation);

      await expect(service.confirmPayment('reservation-1')).rejects.toThrow(BadRequestException);
    });

    
    it('should successfully confirm payment within valid time window (30s check)', async () => {
      const validReservation = {
        ...mockReservation,
        expiresAt: new Date(Date.now() + 5000),
        status: ReservationStatus.PENDING,
      };

      const mockSale = {
        id: 'sale-success-1',
        reservationId: 'reservation-1',
        userId: 'user-1',
        totalAmount: new Prisma.Decimal(25.0),
        confirmedAt: new Date(),
        createdAt: new Date(),
        reservation: validReservation,
        user: validReservation.user,
      };

      reservationsRepository.findById.mockResolvedValue(validReservation);
      salesRepository.createSaleTransaction.mockResolvedValue(mockSale);

      const result = await service.confirmPayment('reservation-1');

      expect(salesRepository.createSaleTransaction).toHaveBeenCalled();
      expect(result.id).toBe('sale-success-1');
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
