import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ReservationStatus, SeatStatus, Sale, Prisma } from '@prisma/client';
import { KAFKA_TOPICS, SALE_EVENTS, SEAT_EVENTS, PaymentConfirmedEvent, SeatSoldEvent } from '../kafka/kafka.events';
import { SalesRepository } from './sales.repository';

@Injectable()
export class SalesService {
    private readonly logger = new Logger(SalesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly salesRepository: SalesRepository,
        private readonly kafka: KafkaService,
    ) { }

    async confirmPayment(reservationId: string): Promise<Sale> {
        const reservation = await this.prisma.reservation.findUnique({
            where: { id: reservationId },
            include: {
                reservationSeats: {
                    include: { seat: true },
                },
                session: true,
            },
        });

        if (!reservation) {
            throw new NotFoundException(`Reservation with ID ${reservationId} not found`);
        }

        if (reservation.status !== ReservationStatus.PENDING) {
            throw new BadRequestException(`Cannot confirm payment. Reservation status is: ${reservation.status}`);
        }

        if (new Date() > reservation.expiresAt) {
            throw new BadRequestException('Reservation has expired. Please create a new reservation.');
        }

        const seatCount = reservation.reservationSeats.length;
        const ticketPrice = reservation.session.ticketPrice;
        const totalAmount = new Prisma.Decimal(ticketPrice.toString()).mul(seatCount);

        const seatIds = reservation.reservationSeats.map((rs) => rs.seat.id);

        const sale = await this.prisma.$transaction(async (tx) => {
            await tx.seat.updateMany({
                where: { id: { in: seatIds } },
                data: { status: SeatStatus.SOLD },
            });

            await tx.reservation.update({
                where: { id: reservationId },
                data: { status: ReservationStatus.CONFIRMED },
            });

            return tx.sale.create({
                data: {
                    reservationId,
                    userId: reservation.userId,
                    totalAmount,
                },
                include: {
                    reservation: {
                        include: {
                            reservationSeats: {
                                include: { seat: true },
                            },
                            session: true,
                        },
                    },
                    user: true,
                },
            });
        });

        const paymentEvent: PaymentConfirmedEvent = {
            eventType: SALE_EVENTS.PAYMENT_CONFIRMED,
            saleId: sale.id,
            reservationId: sale.reservationId,
            userId: sale.userId,
            totalAmount: totalAmount.toNumber(),
            confirmedAt: sale.confirmedAt,
        };

        await this.kafka.emit(KAFKA_TOPICS.SALES, paymentEvent, sale.id);

        const seatSoldEvent: SeatSoldEvent = {
            eventType: SEAT_EVENTS.SOLD,
            sessionId: reservation.sessionId,
            seatIds,
            saleId: sale.id,
            soldAt: sale.confirmedAt,
        };

        await this.kafka.emit(KAFKA_TOPICS.SEATS, seatSoldEvent, reservation.sessionId);

        this.logger.log(`Payment confirmed for reservation ${reservationId}. Sale ID: ${sale.id}, Total: R$ ${totalAmount}`);

        return sale;
    }

    async findAll() {
        return this.salesRepository.findAll();
    }

    async findById(id: string) {
        const sale = await this.salesRepository.findById(id);

        if (!sale) {
            throw new NotFoundException(`Sale with ID ${id} not found`);
        }

        return sale;
    }

    async findByUserId(userId: string) {
        return this.salesRepository.findByUserId(userId);
    }
}
