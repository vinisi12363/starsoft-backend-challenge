import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Session, Seat, Prisma, SeatStatus } from '@prisma/client';

export type SessionWithSeats = Session & { seats: Seat[] };

/**
 * Sessions Repository
 * 
 * Responsável por todas as operações de banco de dados relacionadas a sessões e assentos.
 */
@Injectable()
export class SessionsRepository {
    constructor(private readonly prisma: PrismaService) { }

    async createWithSeats(
        sessionData: Prisma.SessionCreateInput,
        seats: Array<{ rowLabel: string; seatNumber: number; status: SeatStatus }>,
    ): Promise<SessionWithSeats> {
        return this.prisma.session.create({
            data: {
                ...sessionData,
                seats: {
                    createMany: {
                        data: seats,
                    },
                },
            },
            include: {
                seats: {
                    orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
                },
            },
        });
    }

    /**
     * Busca todas as sessões
     */
    async findAll(orderBy?: Prisma.SessionOrderByWithRelationInput): Promise<Session[]> {
        return this.prisma.session.findMany({
            orderBy: orderBy ?? { showTime: 'asc' },
        });
    }

    /**
     * Busca sessão por ID
     */
    async findById(id: string): Promise<Session | null> {
        return this.prisma.session.findUnique({
            where: { id },
        });
    }

    /**
     * Busca sessão por ID com assentos
     */
    async findByIdWithSeats(id: string): Promise<SessionWithSeats | null> {
        return this.prisma.session.findUnique({
            where: { id },
            include: {
                seats: {
                    orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
                },
            },
        });
    }

    /**
     * Busca assentos de uma sessão
     */
    async findSeats(sessionId: string, status?: SeatStatus) {
        return this.prisma.seat.findMany({
            where: {
                sessionId,
                ...(status && { status }),
            },
            orderBy: [{ rowLabel: 'asc' }, { seatNumber: 'asc' }],
        });
    }

    /**
     * Conta assentos disponíveis de uma sessão
     */
    async countAvailableSeats(sessionId: string): Promise<number> {
        return this.prisma.seat.count({
            where: {
                sessionId,
                status: SeatStatus.AVAILABLE,
            },
        });
    }

    /**
     * Atualiza uma sessão
     */
    async update(id: string, data: Prisma.SessionUpdateInput): Promise<Session> {
        return this.prisma.session.update({
            where: { id },
            data,
        });
    }

    /**
     * Deleta uma sessão (cascade deleta assentos)
     */
    async delete(id: string): Promise<Session> {
        return this.prisma.session.delete({
            where: { id },
        });
    }
}
