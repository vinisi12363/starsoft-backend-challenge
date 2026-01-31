import { Injectable, ConflictException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { ReservationsRepository } from './reservations.repository';
import { PrismaService } from 'src/prisma';
import { RedisService } from 'src/redis';
import { KafkaService } from 'src/kafka';
import { CreateReservationDto } from './dto';
import { ReservationStatus, SeatStatus } from '@prisma/client';
// ... outros imports (Kafka, Redis, DTOs)

@Injectable()
export class ReservationsService {
    private readonly logger = new Logger(ReservationsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repository: ReservationsRepository,
        private readonly redis: RedisService,
        private readonly kafka: KafkaService,
    ) {}

    async create(dto: CreateReservationDto, idempotencyKey?: string) {
        const { userId, sessionId, sessionSeatIds } = dto;

        // 1. Camada de Repositório para Idempotência
        if (idempotencyKey) {
            const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
            if (existing) return this.enrichReservation(existing);
        }

        // 2. Lógica de Concorrência (Redis)
        const sortedIds = [...sessionSeatIds].sort();
        const locks = await this.redis.acquireMultipleLocks(
            sortedIds.map(id => `lock:ss:${id}`), 
            10000
        );
        if (!locks) throw new ConflictException('Assentos bloqueados.');

        try {
            // 3. Orquestração da Transação
            const reservation = await this.prisma.$transaction(async (tx) => {
                // UPDATE com Optimistic Locking (direto no tx para performance)
                await Promise.all(sortedIds.map(id => 
                    tx.sessionSeat.update({
                        where: { id, status: 'AVAILABLE' }, // Só reserva se estiver disponível
                        data: { status: 'RESERVED', version: { increment: 1 } }
                    })
                ));

                return tx.reservation.create({
                    data: {
                        userId, sessionId, idempotencyKey,
                        status: 'PENDING',
                        expiresAt: new Date(Date.now() + 30000),
                        reservationSeats: {
                            create: sortedIds.map(id => ({ sessionSeatId: id }))
                        }
                    },
                    include: {
                        reservationSeats: { include: { sessionSeat: { include: { seat: true } } } }
                    }
                });
            });

            // 4. Mensageria
            await this.kafka.emit('reservations-topic', { event: 'CREATED', ...reservation });

            return this.enrichReservation(reservation);
        } finally {
            await this.redis.releaseMultipleLocks(locks);
        }
    }

    private enrichReservation(res: any) {
        return {
            ...res,
            //@ts-ignore
            seatLabels: res.reservationSeats?.map(rs => 
                `${rs.sessionSeat.seat.rowLabel}${rs.sessionSeat.seat.seatNumber}`
            )
        };
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

        // Regra de Negócio: Só cancela se ainda estiver pendente
        if (reservation.status !== ReservationStatus.PENDING) {
            throw new BadRequestException(
                `Não é possível cancelar uma reserva com status: ${reservation.status}`
            );
        }

        const sessionSeatIds = reservation.reservationSeats.map(rs => rs.sessionSeatId);

        try {
            await this.prisma.$transaction(async (tx) => {
                // A. Libera os assentos na tabela SessionSeat
                await tx.sessionSeat.updateMany({
                    where: { id: { in: sessionSeatIds } },
                    data: { 
                        status: SeatStatus.AVAILABLE,
                        // Opcional: não incrementamos version aqui pois voltamos ao estado original
                    }
                });

                // B. Atualiza a reserva para CANCELLED
                await tx.reservation.update({
                    where: { id },
                    data: { status: ReservationStatus.CANCELLED }
                });
            });

            // C. Notifica o Kafka que os assentos foram liberados
            await this.kafka.emit('reservations-topic', {
                eventType: 'RESERVATION_CANCELLED',
                reservationId: id,
                sessionSeatIds
            });

            this.logger.log(`Reserva ${id} cancelada e ${sessionSeatIds.length} assentos liberados.`);
        } catch (error) {
            this.logger.error(`Erro ao cancelar reserva ${id}: ${error.message}`);
            throw error;
        }
    }
}