import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Session, Prisma, SeatStatus } from '@prisma/client';

@Injectable()
export class SessionsRepository {
    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
    return this.prisma.session.findMany({
        include: {
            room: true,
            _count: {
                select: {
                    sessionSeats: {
                        where: { status: 'AVAILABLE' } 
                    }
                }
            }
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
                        seat: true
                    },
                    orderBy: {
                        seat: { rowLabel: 'asc' }
                    }
                }
            }
        });
    }
   
    private readonly deepInclude: Prisma.SessionInclude = {
    sessionSeats: {
        include: { seat: true },
        orderBy: {
            seat: {
                rowLabel: 'asc' as const // O 'as const' resolve o erro TS2322
            }
        }
    },
    room: true
};

    async create(data: Prisma.SessionCreateInput) {
        return this.prisma.session.create({
            data,
            include: { room: true }
        });
    }

    async findSessionSeats(sessionId: string, status?: SeatStatus) {
        return this.prisma.sessionSeat.findMany({
            where: {
                sessionId,
                ...(status && { status }),
            },
            include: { seat: true },
        });
    }
}