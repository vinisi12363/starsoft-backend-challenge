import { Injectable, ConflictException, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { ReservationsRepository } from './reservations.repository';
import { PrismaService } from '../prisma';
import { RedisService } from '../redis';
import { KafkaService } from '../kafka';
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
    ) { }

    async create(dto: CreateReservationDto, idempotencyKey?: string) {
        const { userId, sessionId, sessionSeatIds } = dto;

        // 1. Idempotência (Garantia de que não processa o mesmo request)
        if (idempotencyKey) {
            const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
            if (existing) return this.enrichReservation(existing);
        }

        // 2. Locks de Concorrência (Redis) - Regra de "trânsito" da aplicação
        const locks = await this.redis.acquireMultipleLocks(
            sessionSeatIds.map(id => `lock:ss:${id}`), 10000
        );
        if (!locks) throw new ConflictException('Assentos em processo de reserva.');

        try {
            // 3. Delega a bomba para o Repositório
            const reservation = await this.repository.createWithAtomicSeats({
                userId,
                sessionId,
                sessionSeatIds,
                idempotencyKey,
                expiresAt: new Date(Date.now() + 30000) // 30 segundos
            });

            // 4. Mensageria (Kafka)
            await this.kafka.emit('reservations-topic', { event: 'CREATED', ...reservation });

            return this.enrichReservation(reservation);

        } catch (error) {
            // Tratamos o erro específico que o Repository lançou
            if (error.message === 'SEATS_NOT_AVAILABLE') {
                throw new ConflictException('Um ou mais assentos já foram reservados.');
            }
            throw error; // Erros genéricos continuam subindo
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