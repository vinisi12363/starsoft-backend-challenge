import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReservationStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReservationsRepository {
    constructor(private readonly prisma: PrismaService) { }

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

        return this.prisma.$transaction(async (tx) => {
            const updateResults = await Promise.all(
                sessionSeatIds.map((id) =>
                    tx.sessionSeat.updateMany({
                        where: { id, status: 'AVAILABLE' },
                        data: { status: 'RESERVED', version: { increment: 1 } },
                    }),
                ),
            );

            const success = updateResults.every((res) => res.count === 1);
            if (!success) {
                throw new Error('SEATS_NOT_AVAILABLE');
            }

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

    async findAll() {
        return this.prisma.reservation.findMany({
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
                reservationSeats: true,
            },
        });
    }

    async expire(id: string, sessionSeatIds: string[]) {
        return this.prisma.$transaction(async (tx) => {
            await tx.sessionSeat.updateMany({
                where: { id: { in: sessionSeatIds } },
                data: { status: 'AVAILABLE' },
            });

            return tx.reservation.update({
                where: { id },
                data: { status: 'EXPIRED' },
            });
        });
    }
}
