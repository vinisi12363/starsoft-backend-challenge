import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Reservation, ReservationStatus, SeatStatus, Prisma } from '@prisma/client';
import { KAFKA_TOPICS, RESERVATION_EVENTS, ReservationCreatedEvent } from '../kafka/kafka.events';
import { ReservationsRepository } from './reservations.repository';

const LOCK_TTL_MS = 5000;

@Injectable()
export class ReservationsService {
    private readonly logger = new Logger(ReservationsService.name);
    private readonly reservationTtlSeconds: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly reservationsRepository: ReservationsRepository,
        private readonly redis: RedisService,
        private readonly kafka: KafkaService,
        private readonly config: ConfigService,
    ) {
        this.reservationTtlSeconds = this.config.get<number>('RESERVATION_TTL_SECONDS', 30);
    }

    async create(
        createReservationDto: CreateReservationDto,
        idempotencyKey?: string,
    ): Promise<Reservation & { expiresAt: Date; seatIds: string[] }> {
        const { userId, sessionId, seatIds } = createReservationDto;

        if (idempotencyKey) {
            const existingReservation = await this.reservationsRepository.findByIdempotencyKey(idempotencyKey);
            if (existingReservation) {
                this.logger.log(`Returning existing reservation for idempotency key: ${idempotencyKey}`);
                return this.enrichReservation(existingReservation);
            }
        }

        const sortedSeatIds = [...seatIds].sort();
        const lockKeys = sortedSeatIds.map((id) => `lock:seat:${id}`);

        const locks = await this.redis.acquireMultipleLocks(lockKeys, LOCK_TTL_MS);

        if (!locks) {
            throw new ConflictException('Unable to acquire locks for the requested seats. They may be in use by another user.');
        }

        try {
            const seats = await this.prisma.seat.findMany({
                where: { id: { in: sortedSeatIds } },
            });

            if (seats.length !== sortedSeatIds.length) {
                throw new NotFoundException('One or more seats not found');
            }

            const unavailableSeats = seats.filter((seat) => seat.status !== SeatStatus.AVAILABLE);
            if (unavailableSeats.length > 0) {
                const unavailableLabels = unavailableSeats.map((s) => `${s.rowLabel}${s.seatNumber}`).join(', ');
                throw new ConflictException(`The following seats are not available: ${unavailableLabels}`);
            }

            const allSameSession = seats.every((seat) => seat.sessionId === sessionId);
            if (!allSameSession) {
                throw new BadRequestException('All seats must belong to the same session');
            }

            const expiresAt = new Date(Date.now() + this.reservationTtlSeconds * 1000);

            const reservation = await this.prisma.$transaction(async (tx) => {
                await tx.seat.updateMany({
                    where: { id: { in: sortedSeatIds } },
                    data: { status: SeatStatus.RESERVED },
                });

                return tx.reservation.create({
                    data: {
                        userId,
                        sessionId,
                        expiresAt,
                        status: ReservationStatus.PENDING,
                        ...(idempotencyKey && { idempotencyKey }),
                        reservationSeats: {
                            create: sortedSeatIds.map((seatId) => ({ seatId })),
                        },
                    },
                    include: {
                        reservationSeats: {
                            include: { seat: true },
                        },
                        session: true,
                        user: true,
                    },
                });
            });

            const event: ReservationCreatedEvent = {
                eventType: RESERVATION_EVENTS.CREATED,
                reservationId: reservation.id,
                userId: reservation.userId,
                sessionId: reservation.sessionId,
                seatIds: sortedSeatIds,
                expiresAt: reservation.expiresAt,
                createdAt: reservation.createdAt,
            };

            await this.kafka.emit(KAFKA_TOPICS.RESERVATIONS, event, reservation.id);

            this.logger.log(`Reservation created: ${reservation.id} | User: ${userId} | Seats: ${sortedSeatIds.length} | Expires in ${this.reservationTtlSeconds}s`);

            return this.enrichReservation(reservation);
        } finally {
            await this.redis.releaseMultipleLocks(locks);
        }
    }

    async findById(id: string) {
        const reservation = await this.reservationsRepository.findById(id);

        if (!reservation) {
            throw new NotFoundException(`Reservation with ID ${id} not found`);
        }

        return this.enrichReservation(reservation);
    }

    async findByIdempotencyKey(idempotencyKey: string) {
        return this.reservationsRepository.findByIdempotencyKey(idempotencyKey);
    }

    async cancel(id: string): Promise<void> {
        const reservation = await this.reservationsRepository.findById(id);

        if (!reservation) {
            throw new NotFoundException(`Reservation with ID ${id} not found`);
        }

        if (reservation.status !== ReservationStatus.PENDING) {
            throw new BadRequestException(`Cannot cancel reservation with status: ${reservation.status}`);
        }

        const seatIds = reservation.reservationSeats.map((rs) => rs.seat.id);

        await this.prisma.$transaction(async (tx) => {
            await tx.seat.updateMany({
                where: { id: { in: seatIds } },
                data: { status: SeatStatus.AVAILABLE },
            });

            await tx.reservation.update({
                where: { id },
                data: { status: ReservationStatus.CANCELLED },
            });
        });

        this.logger.log(`Reservation cancelled: ${id}`);
    }

    private enrichReservation(reservation: any) {
        const seatIds = reservation.reservationSeats.map((rs: any) => rs.seat.id);
        return {
            ...reservation,
            seatIds,
        };
    }
}
