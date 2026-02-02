import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ReservationStatus, SeatStatus, type Sale, Prisma } from '@prisma/client';
import { SalesRepository } from './sales.repository';
import { ReservationsRepository } from '../reservations/reservations.repository';
import { KAFKA_TOPICS, SALE_EVENTS, SEAT_EVENTS } from 'src/common/enums/kafka-topics';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesRepository: SalesRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly kafka: KafkaService,
  ) { }

  async confirmPayment(reservationId: string): Promise<Sale> {
    const reservation = await this.reservationsRepository.findById(reservationId);

    if (!reservation) {
      throw new NotFoundException(`Reserva ${reservationId} não encontrada.`);
    }

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new BadRequestException(
        `Pagamento não pode ser confirmado. Status: ${reservation.status}`,
      );
    }

    if (new Date() > reservation.expiresAt) {
      throw new BadRequestException(
        'A reserva expirou. O assento foi liberado para outros usuários.',
      );
    }

    const seatCount = reservation.reservationSeats.length;
    const ticketPrice = new Prisma.Decimal(reservation.session.ticketPrice.toString());
    const totalAmount = ticketPrice.mul(seatCount);

    const sessionSeatIds = reservation.reservationSeats.map((rs) => rs.sessionSeatId);

    const sale = await this.prisma.$transaction(async (tx) => {
      await tx.sessionSeat.updateMany({
        where: { id: { in: sessionSeatIds } },
        data: { status: SeatStatus.SOLD },
      });

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CONFIRMED },
      });

      return this.salesRepository.create({
        reservationId,
        userId: reservation.userId,
        totalAmount,
      });
    });

    await this.emitSaleEvents(sale, sessionSeatIds, reservation.sessionId);

    this.logger.log(
      `Venda finalizada: ${sale.id} | Total: R$ ${totalAmount} | Assentos: ${seatCount}`,
    );

    return sale;
  }

  private async emitSaleEvents(sale: Sale, sessionSeatIds: string[], sessionId: string) {
    await this.kafka.emit(
      KAFKA_TOPICS.SALES,
      {
        eventType: SALE_EVENTS.PAYMENT_CONFIRMED,
        saleId: sale.id,
        totalAmount: sale.totalAmount,
        confirmedAt: sale.confirmedAt,
      },
      sale.id,
    );

    await this.kafka.emit(
      KAFKA_TOPICS.SEATS,
      {
        eventType: SEAT_EVENTS.SOLD,
        sessionId,
        sessionSeatIds,
        saleId: sale.id,
      },
      sessionId,
    );
  }

  async findAll() {
    return this.salesRepository.findAll();
  }
  async findByUserId(userId: string) {
    return this.salesRepository.findByUserId(userId);
  }

  async findById(id: string) {
    const sale = await this.salesRepository.findById(id);
    if (!sale) throw new NotFoundException(`Venda ${id} não encontrada.`);
    return sale;
  }
}
