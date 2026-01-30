import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Reservation, Prisma, ReservationStatus } from '@prisma/client';

@Injectable()
export class ReservationsRepository {
    constructor(private readonly prisma: PrismaService) { }

    async findById(id: string) {
        return this.prisma.reservation.findUnique({
            where: { id },
            include: {
                reservationSeats: {
                    include: { seat: true },
                },
                session: true,
                user: true,
            },
        });
    }

    async findByIdempotencyKey(idempotencyKey: string) {
        return this.prisma.reservation.findUnique({
            where: { idempotencyKey },
            include: {
                reservationSeats: {
                    include: { seat: true },
                },
                session: true,
            },
        });
    }

    async findExpired(now: Date) {
        return this.prisma.reservation.findMany({
            where: {
                status: ReservationStatus.PENDING,
                expiresAt: { lt: now },
            },
            include: {
                reservationSeats: {
                    include: { seat: true },
                },
            },
        });
    }

    async findByUserId(userId: string) {
        return this.prisma.reservation.findMany({
            where: { userId },
            include: {
                reservationSeats: {
                    include: { seat: true },
                },
                session: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async create(data: Prisma.ReservationCreateInput) {
        return this.prisma.reservation.create({
            data,
            include: {
                reservationSeats: {
                    include: { seat: true },
                },
                session: true,
                user: true,
            },
        });
    }

    async update(id: string, data: Prisma.ReservationUpdateInput) {
        return this.prisma.reservation.update({
            where: { id },
            data,
        });
    }

    async count(where?: Prisma.ReservationWhereInput): Promise<number> {
        return this.prisma.reservation.count({ where });
    }
}
