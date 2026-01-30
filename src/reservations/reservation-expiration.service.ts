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
        private readonly reservationsRepository: ReservationsRepository,
        private readonly kafka: KafkaService,
    ) { }

    /**
     * Cron job que roda a cada 5 segundos para verificar e expirar reservas
     */
    @Cron(CronExpression.EVERY_5_SECONDS)
    async handleExpiredReservations() {
        const now = new Date();

        const expiredReservations = await this.reservationsRepository.findExpired(now);

        if (expiredReservations.length === 0) {
            return;
        }

        this.logger.log(
            `Found ${expiredReservations.length} expired reservations to process`,
        );

        for (const reservation of expiredReservations) {
            try {
                const seatIds = reservation.reservationSeats.map((rs) => rs.seat.id);

                // Atualizar em transação
                await this.prisma.$transaction(async (tx) => {
                    // Liberar assentos
                    await tx.seat.updateMany({
                        where: { id: { in: seatIds } },
                        data: { status: SeatStatus.AVAILABLE },
                    });

                    // Marcar reserva como expirada
                    await tx.reservation.update({
                        where: { id: reservation.id },
                        data: { status: ReservationStatus.EXPIRED },
                    });
                });

                // Publicar evento de reserva expirada
                const expiredEvent: ReservationExpiredEvent = {
                    eventType: RESERVATION_EVENTS.EXPIRED,
                    reservationId: reservation.id,
                    userId: reservation.userId,
                    sessionId: reservation.sessionId,
                    seatIds,
                    expiredAt: now,
                };

                await this.kafka.emit(
                    KAFKA_TOPICS.RESERVATIONS,
                    expiredEvent,
                    reservation.id,
                );

                // Publicar evento de assentos liberados
                const seatReleasedEvent: SeatReleasedEvent = {
                    eventType: SEAT_EVENTS.RELEASED,
                    sessionId: reservation.sessionId,
                    seatIds,
                    reason: 'expired',
                    releasedAt: now,
                };

                await this.kafka.emit(
                    KAFKA_TOPICS.SEATS,
                    seatReleasedEvent,
                    reservation.sessionId,
                );

                this.logger.log(
                    `Reservation ${reservation.id} expired. Released seats: ${seatIds.join(', ')}`,
                );
            } catch (error) {
                this.logger.error(
                    `Error expiring reservation ${reservation.id}:`,
                    error,
                );
            }
        }
    }
}
