import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReservationsRepository {
    constructor(private readonly prisma: PrismaService) { }

    // Usamos um seletor padrão para evitar repetir esses includes gigantes
    private readonly deepInclude = {
        reservationSeats: {
            include: {
                sessionSeat: {
                    include: { seat: true }
                }
            }
        },
        session: true,
        user: true,
    };

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
}