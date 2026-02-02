import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, RoomStatus } from '@prisma/client';

@Injectable()
export class RoomsRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(data: Prisma.RoomCreateInput) {
        return this.prisma.room.create({ data });
    }

    async findAll() {
        return this.prisma.room.findMany({
            include: {
                _count: {
                    select: { seats: true },
                },
            },
        });
    }

    async findById(id: string) {
        return this.prisma.room.findUnique({
            where: { id },
            include: { seats: true },
        });
    }

    async updateStatus(id: string, status: RoomStatus) {
        return this.prisma.room.update({
            where: { id },
            data: { status },
        });
    }
}
