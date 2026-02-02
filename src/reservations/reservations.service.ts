import {
    Injectable,
    ConflictException,
    NotFoundException,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReservationsRepository } from './reservations.repository';
import { PrismaService } from '../prisma';
import { RedisService } from '../redis';
import { KafkaService } from '../kafka';
import type { CreateReservationDto } from './dto';
import { type Reservation, ReservationStatus, SeatStatus } from '@prisma/client';


@Injectable()
export class ReservationsService {
    private readonly logger = new Logger(ReservationsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repository: ReservationsRepository,
        private readonly redis: RedisService,
        private readonly kafka: KafkaService,
        private readonly configService: ConfigService,
    ) { }

    async create(dto: CreateReservationDto, idempotencyKey?: string) {
        const { userId, sessionId, sessionSeatIds } = dto;

        if (idempotencyKey) {
            const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
            if (existing) return this.enrichReservation(existing);
        }

        const locks = await this.redis.acquireMultipleLocks(
            sessionSeatIds.map((id) => `lock:ss:${id}`),
            this.configService.get<number>('RESERVATION_TTL_SECONDS', 30000),
        );
        if (!locks) throw new ConflictException('Assentos em processo de reserva.');

        try {
            const reservation = await this.repository.createWithAtomicSeats({   
                userId,
                sessionId,
                sessionSeatIds,
                idempotencyKey,
                expiresAt: new Date(Date.now() + this.configService.get<number>('RESERVATION_TTL_SECONDS', 30000)),
            });

            await this.kafka.emit('reservations-topic', { event: 'CREATED', ...reservation });

            return this.enrichReservation(reservation);
        } catch (error) {
            if (error.message === 'SEATS_NOT_AVAILABLE') {
                throw new ConflictException('Um ou mais assentos já foram reservados.');
            }
            throw error; // Erros genéricos continuam subindo
        } finally {
            await this.redis.releaseMultipleLocks(locks);
        }
    }

    private enrichReservation(res: Reservation) {
        return {
            ...res,
            //@ts-ignore
            seatLabels: res.reservationSeats?.map(
                //@ts-ignore
                (rs) => `${rs.sessionSeat.seat.rowLabel}${rs.sessionSeat.seat.seatNumber}`,
            ),
        };
    }
    async findAll() {
        const reservations = await this.repository.findAll();
        return reservations.map(this.enrichReservation);
    }
    async findById(id: string) {
        const reservation = await this.repository.findById(id);

        if (!reservation) {
            throw new NotFoundException(`Reserva ${id} não encontrada.`);
        }

        return this.enrichReservation(reservation);
    }

    async cancel(id: string): Promise<void> {
        // Busca a reserva com os assentos vinculados
        const reservation = await this.repository.findById(id);

        if (!reservation) {
            throw new NotFoundException(`Reserva ${id} não encontrada.`);
        }

        if (reservation.status !== ReservationStatus.PENDING) {
            throw new BadRequestException(
                `Não é possível cancelar uma reserva com status: ${reservation.status}`,
            );
        }

        const sessionSeatIds = reservation.reservationSeats.map((rs) => rs.sessionSeatId);

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.sessionSeat.updateMany({
                    where: { id: { in: sessionSeatIds } },
                    data: { status: SeatStatus.AVAILABLE },
                });

                await tx.reservation.update({
                    where: { id },
                    data: { status: ReservationStatus.CANCELLED },
                });
            });

            await this.kafka.emit('reservations-topic', {
                eventType: 'RESERVATION_CANCELLED',
                reservationId: id,
                sessionSeatIds,
            });

            this.logger.log(`Reserva ${id} cancelada e ${sessionSeatIds.length} assentos liberados.`);
        } catch (error) {
            this.logger.error(`Erro ao cancelar reserva ${id}: ${error.message}`);
            throw error;
        }
    }
}
