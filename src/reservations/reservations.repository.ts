import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReservationStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReservationsRepository {
    constructor(private readonly prisma: PrismaService) { }

    // Usamos um seletor padrão para evitar repetir esses includes gigantes
    private readonly deepInclude = {
        reservationSeats: {
            include: {
                sessionSeat: {
                    include: { seat: true },
                },
            },
        },
        session: true,
        user: true,
    };

    async createWithAtomicSeats(data: {
        userId: string;
        sessionId: string;
        sessionSeatIds: string[];
        idempotencyKey?: string;
        expiresAt: Date;
    }) {
        const { userId, sessionId, sessionSeatIds, idempotencyKey, expiresAt } = data;

        // Toda a "sujeira" do Prisma e da transação fica escondida aqui
        return this.prisma.$transaction(async (tx) => {
            // 1. Tenta o Update Atômico (usando updateMany para não explodir erro 500)
            const updateResults = await Promise.all(
                sessionSeatIds.map((id) =>
                    tx.sessionSeat.updateMany({
                        where: { id, status: 'AVAILABLE' },
                        data: { status: 'RESERVED', version: { increment: 1 } },
                    }),
                ),
            );

            // 2. Verifica se algum falhou (se o count for 0, o lugar já era)
            const success = updateResults.every((res) => res.count === 1);
            if (!success) {
                // Lançamos o erro aqui, a Service só repassa ou trata
                throw new Error('SEATS_NOT_AVAILABLE');
            }

            // 3. Cria a reserva de fato
            return tx.reservation.create({
                data: {
                    userId,
                    sessionId,
                    idempotencyKey,
                    status: 'PENDING',
                    expiresAt,
                    reservationSeats: {
                        create: sessionSeatIds.map((id) => ({ sessionSeatId: id })),
                    },
                },
                include: {
                    reservationSeats: {
                        include: { sessionSeat: { include: { seat: true } } },
                    },
                },
            });
        });
    }

    async findById(id: string) {
        return this.prisma.reservation.findUnique({
            where: { id },
            include: this.deepInclude,
        });
    }

    async findByIdempotencyKey(key: string) {
        return this.prisma.reservation.findUnique({
            where: { idempotencyKey: key },
            include: this.deepInclude,
        });
    }

    // Método que aceita uma transação opcional
    async updateStatus(id: string, status: ReservationStatus, tx?: Prisma.TransactionClient) {
        const client = tx || this.prisma;
        return client.reservation.update({
            where: { id },
            data: { status },
        });
    }

    async findExpired(now: Date) {
        return this.prisma.reservation.findMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: now },
            },
            include: {
                reservationSeats: true, // Aqui pegamos os IDs das SessionSeats
            },
        });
    }

    async expire(id: string, sessionSeatIds: string[]) {
        return this.prisma.$transaction(async (tx) => {
            // 1. Libera os assentos (Atomicidade)
            await tx.sessionSeat.updateMany({
                where: { id: { in: sessionSeatIds } },
                data: { status: 'AVAILABLE' },
            });

            // 2. Marca a reserva como EXPIRED
            return tx.reservation.update({
                where: { id },
                data: { status: 'EXPIRED' },
            });
        });
    }
}
