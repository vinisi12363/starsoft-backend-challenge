import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ReservationStatus, SeatStatus } from '@prisma/client';
import {
    KAFKA_TOPICS,
    RESERVATION_EVENTS,
    SEAT_EVENTS,
    ReservationExpiredEvent,
    SeatReleasedEvent,
} from '../kafka/kafka.events';
import { ReservationsRepository } from './reservations.repository';
@Injectable()
export class ReservationExpirationService {
    private readonly logger = new Logger(ReservationExpirationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repository: ReservationsRepository,
        private readonly kafka: KafkaService,
    ) { }

    @Cron(CronExpression.EVERY_5_SECONDS)
    async handleExpiredReservations() {
        const now = new Date();
        const expiredReservations = await this.repository.findExpired(now);

        if (expiredReservations.length === 0) return;

        this.logger.log(`Processando ${expiredReservations.length} reservas expiradas...`);

        for (const reservation of expiredReservations) {
            try {
                // No novo schema, usamos o sessionSeatId
                const sessionSeatIds = reservation.reservationSeats.map((rs) => rs.sessionSeatId);

                await this.prisma.$transaction(async (tx) => {
                    // 1. Libera os assentos da SESSÃO específica
                    await tx.sessionSeat.updateMany({
                        where: { id: { in: sessionSeatIds } },
                        data: { status: SeatStatus.AVAILABLE },
                    });

                    // 2. Marca a reserva como EXPIRED
                    await tx.reservation.update({
                        where: { id: reservation.id },
                        data: { status: ReservationStatus.EXPIRED },
                    });
                });

                // 3. Evento Kafka de Expiração
                await this.kafka.emit(KAFKA_TOPICS.RESERVATIONS, {
                    eventType: RESERVATION_EVENTS.EXPIRED,
                    reservationId: reservation.id,
                    sessionId: reservation.sessionId,
                    sessionSeatIds,
                }, reservation.id);

                this.logger.log(`Reserva ${reservation.id} expirada com sucesso.`);
            } catch (error) {
                this.logger.error(`Falha ao expirar reserva ${reservation.id}: ${error.message}`);
            }
        }
    }
}