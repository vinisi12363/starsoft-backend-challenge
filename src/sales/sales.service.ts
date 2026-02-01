import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ReservationStatus, SeatStatus, type Sale, Prisma } from '@prisma/client';
import { KAFKA_TOPICS, SALE_EVENTS, SEAT_EVENTS } from '../kafka/kafka.events';
import { SalesRepository } from './sales.repository';
import { ReservationsRepository } from '../reservations/reservations.repository';

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
    // 1. Busca a reserva usando o Repository (Mantendo o padrão)
    const reservation = await this.reservationsRepository.findById(reservationId);

    if (!reservation) {
      throw new NotFoundException(`Reserva ${reservationId} não encontrada.`);
    }

    // 2. Regras de Negócio (Guard Clauses)
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

    // 3. Cálculos
    const seatCount = reservation.reservationSeats.length;
    const ticketPrice = new Prisma.Decimal(reservation.session.ticketPrice.toString());
    const totalAmount = ticketPrice.mul(seatCount);

    const sessionSeatIds = reservation.reservationSeats.map((rs) => rs.sessionSeatId);

    // 4. Transação Atômica (O coração da venda)
    const sale = await this.prisma.$transaction(async (tx) => {
      // A. Atualiza SessionSeats para SOLD (usando tx para garantir atomicidade)
      await tx.sessionSeat.updateMany({
        where: { id: { in: sessionSeatIds } },
        data: { status: SeatStatus.SOLD },
      });

      // B. Confirma a Reserva
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CONFIRMED },
      });

      // C. Cria a Venda usando o Repository (passando o contexto da transação)
      return this.salesRepository.create({
        reservationId,
        userId: reservation.userId,
        totalAmount,
      });
    });

    // 5. Mensageria (Kafka) - Notifica o mundo que a venda foi feita
    await this.emitSaleEvents(sale, sessionSeatIds, reservation.sessionId);

    this.logger.log(
      `Venda finalizada: ${sale.id} | Total: R$ ${totalAmount} | Assentos: ${seatCount}`,
    );

    return sale;
  }

  private async emitSaleEvents(sale: Sale, sessionSeatIds: string[], sessionId: string) {
    // Evento de Pagamento
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

    // Evento de Assento Vendido
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

  // Métodos de consulta delegando para o Repository
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
