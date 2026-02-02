import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SeatStatus } from '@prisma/client';

@Injectable()
export class SessionsRepository {
    constructor(private readonly prisma: PrismaService) { }

    private readonly deepInclude: Prisma.SessionInclude = {
        sessionSeats: {
            include: { seat: true },
            orderBy: {
                seat: {
                    rowLabel: 'asc' as const,
                },
            },
        },
        room: true,
    };

    async findAll() {
        return this.prisma.session.findMany({
            include: {
                room: true,
                _count: {
                    select: {
                        sessionSeats: {
                            where: { status: 'AVAILABLE' },
                        },
                    },
                },
            },
            orderBy: { startShowTime: 'asc' },
        });
    }

    async findById(id: string, status?: SeatStatus) {
        return this.prisma.session.findUnique({
            where: { id },
            include: {
                ...this.deepInclude,
                sessionSeats: {
                    where: status ? { status } : {},
                    include: {
                        seat: true,
                    },
                    orderBy: {
                        seat: { rowLabel: 'asc' },
                    },
                },
            },
        });
    }

    async findRoomWithSeats(roomId: string) {
        return this.prisma.room.findUnique({
            where: { id: roomId },
            include: { seats: true },
        });
    }

    async createWithSeats(
        sessionData: {
            movieTitle: string;
            startShowTime: Date;
            endShowTime: Date;
            ticketPrice: Prisma.Decimal;
            roomId: string;
        },
        seats: Array<{ id: string }>,
    ) {
        return this.prisma.$transaction(async (tx) => {
            const session = await tx.session.create({
                data: sessionData,
            });

            await tx.sessionSeat.createMany({
                data: seats.map((seat) => ({
                    sessionId: session.id,
                    seatId: seat.id,
                    status: SeatStatus.AVAILABLE,
                    version: 0,
                })),
            });

            return session;
        });
    }
}
