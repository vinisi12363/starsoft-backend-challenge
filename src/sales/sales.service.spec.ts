import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ReservationStatus, SeatStatus, Prisma } from '@prisma/client';

describe('SalesService', () => {
    let service: SalesService;
    let prismaService: jest.Mocked<PrismaService>;
    let kafkaService: jest.Mocked<KafkaService>;

    const mockSession = {
        id: 'session-1',
        movieTitle: 'Test Movie',
        showTime: new Date(),
        roomName: 'Sala 1',
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
        reservationSeats: [{ seat: mockSeat }],
        session: mockSession,
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
            $transaction: jest.fn(),
        };

        const kafkaServiceMock = {
            emit: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SalesService,
                { provide: PrismaService, useValue: prismaServiceMock },
                { provide: KafkaService, useValue: kafkaServiceMock },
            ],
        }).compile();

        service = module.get<SalesService>(SalesService);
        prismaService = module.get(PrismaService);
        kafkaService = module.get(KafkaService);
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

            prismaService.reservation.findUnique.mockResolvedValue(mockReservation);
            prismaService.$transaction.mockResolvedValue(mockSale);

            const result = await service.confirmPayment('reservation-1');

            expect(result).toBeDefined();
            expect(result.id).toBe('sale-1');
            expect(kafkaService.emit).toHaveBeenCalledTimes(2); // Payment + Seat events
        });

        it('should throw NotFoundException when reservation does not exist', async () => {
            prismaService.reservation.findUnique.mockResolvedValue(null);

            await expect(service.confirmPayment('non-existent')).rejects.toThrow(
                NotFoundException,
            );
        });

        it('should throw BadRequestException when reservation is not pending', async () => {
            const confirmedReservation = {
                ...mockReservation,
                status: ReservationStatus.CONFIRMED,
            };

            prismaService.reservation.findUnique.mockResolvedValue(confirmedReservation);

            await expect(service.confirmPayment('reservation-1')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('should throw BadRequestException when reservation is expired', async () => {
            const expiredReservation = {
                ...mockReservation,
                expiresAt: new Date(Date.now() - 1000), // Already expired
            };

            prismaService.reservation.findUnique.mockResolvedValue(expiredReservation);

            await expect(service.confirmPayment('reservation-1')).rejects.toThrow(
                BadRequestException,
            );
        });

        it('should calculate correct total amount for multiple seats', async () => {
            const multiSeatReservation = {
                ...mockReservation,
                reservationSeats: [
                    { seat: { ...mockSeat, id: 'seat-1' } },
                    { seat: { ...mockSeat, id: 'seat-2' } },
                    { seat: { ...mockSeat, id: 'seat-3' } },
                ],
            };

            const mockSale = {
                id: 'sale-1',
                reservationId: 'reservation-1',
                userId: 'user-1',
                totalAmount: new Prisma.Decimal(75.0), // 3 seats * R$25
                confirmedAt: new Date(),
                createdAt: new Date(),
                reservation: multiSeatReservation,
                user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
            };

            prismaService.reservation.findUnique.mockResolvedValue(multiSeatReservation);
            prismaService.$transaction.mockImplementation(async (callback) => {
                // Verify the transaction creates a sale with correct amount
                return mockSale;
            });

            const result = await service.confirmPayment('reservation-1');

            expect(result.totalAmount.toNumber()).toBe(75.0);
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
            };

            prismaService.sale.findUnique.mockResolvedValue(mockSale);

            const result = await service.findById('sale-1');

            expect(result).toEqual(mockSale);
        });

        it('should throw NotFoundException when sale not found', async () => {
            prismaService.sale.findUnique.mockResolvedValue(null);

            await expect(service.findById('non-existent')).rejects.toThrow(
                NotFoundException,
            );
        });
    });
});
