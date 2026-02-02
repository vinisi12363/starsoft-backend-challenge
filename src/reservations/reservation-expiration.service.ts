import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ReservationsRepository } from './reservations.repository';
import { KAFKA_TOPICS, RESERVATION_EVENTS } from 'src/common/enums/kafka-topics';
@Injectable()
export class ReservationExpirationService {
    private readonly logger = new Logger(ReservationExpirationService.name);

    constructor(
        private readonly repository: ReservationsRepository,
        private readonly kafka: KafkaService,
    ) { }

    @Cron(CronExpression.EVERY_5_SECONDS)
    async handleExpiredReservations() {
        const now = new Date();
        const expiredReservations = await this.repository.findExpired(now);

        if (expiredReservations.length === 0) return;

        for (const res of expiredReservations) {
            try {
                const ids = res.reservationSeats.map((rs) => rs.sessionSeatId);

                await this.repository.expire(res.id, ids);

                await this.kafka.emit(KAFKA_TOPICS.RESERVATIONS, {
                    eventType: RESERVATION_EVENTS.EXPIRED,
                    reservationId: res.id,
                    sessionSeatIds: ids,
                });

                this.logger.log(`Reserva ${res.id} expirada via cron.`);
            } catch (error) {
                this.logger.error(`Erro ao expirar ${res.id}: ${error.message}`);
            }
        }
    }
}
