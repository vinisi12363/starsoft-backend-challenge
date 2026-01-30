import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Sale, Prisma } from '@prisma/client';

@Injectable()
export class SalesRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(data: Prisma.SaleUncheckedCreateInput) {
        return this.prisma.sale.create({
            data,
            include: {
                reservation: {
                    include: {
                        reservationSeats: {
                            include: { seat: true },
                        },
                        session: true,
                    },
                },
                user: true,
            },
        });
    }

    async findAll() {
        return this.prisma.sale.findMany({
            include: {
                reservation: {
                    include: {
                        session: true,
                        reservationSeats: {
                            include: { seat: true },
                        },
                    },
                },
                user: true,
            },
            orderBy: { confirmedAt: 'desc' },
        });
    }

    async findById(id: string) {
        return this.prisma.sale.findUnique({
            where: { id },
            include: {
                reservation: {
                    include: {
                        session: true,
                        reservationSeats: {
                            include: { seat: true },
                        },
                    },
                },
                user: true,
            },
        });
    }

    async findByUserId(userId: string) {
        return this.prisma.sale.findMany({
            where: { userId },
            include: {
                reservation: {
                    include: {
                        session: true,
                        reservationSeats: {
                            include: { seat: true },
                        },
                    },
                },
            },
            orderBy: { confirmedAt: 'desc' },
        });
    }

    async count(where?: Prisma.SaleWhereInput): Promise<number> {
        return this.prisma.sale.count({ where });
    }
}
