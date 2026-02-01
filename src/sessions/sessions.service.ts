import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { CreateSessionDto } from './dto/create-session.dto';
import { SeatStatus, Prisma } from '@prisma/client';
import { SessionsRepository } from './sessions.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionsService {
    constructor(
        private readonly prisma: PrismaService, // Usado para a transação de criação
        private readonly sessionsRepository: SessionsRepository,
    ) { }

    async create(dto: CreateSessionDto) {
        // 1. Verificar se a sala existe e pegar os assentos físicos dela
        const room = await this.prisma.room.findUnique({
            where: { id: dto.roomId },
            include: { seats: true },
        });

        if (!room) throw new NotFoundException('Sala não encontrada.');

        // 2. Regra de Negócio: Mínimo 16 assentos
        if (room.seats.length < 16) {
            throw new BadRequestException(
                `A sala precisa ter no mínimo 16 assentos cadastrados. Atual: ${room.seats.length}`,
            );
        }

        // 3. Transação Atômica: Cria a sessão e popula os SessionSeats
        return this.prisma.$transaction(async (tx) => {
            const session = await tx.session.create({
                data: {
                    movieTitle: dto.movieTitle,
                    startShowTime: new Date(dto.startShowTime),
                    endShowTime: new Date(dto.endShowTime),
                    ticketPrice: new Prisma.Decimal(dto.ticketPrice),
                    roomId: dto.roomId,
                },
            });

            // Criar o estado de cada assento para ESTA sessão
            await tx.sessionSeat.createMany({
                data: room.seats.map((seat) => ({
                    sessionId: session.id,
                    seatId: seat.id,
                    status: SeatStatus.AVAILABLE,
                    version: 0, // Início do Optimistic Locking
                })),
            });

            return session;
        });
    }

    async getSessionMap(sessionId: string, status?: SeatStatus) {
        const session = await this.sessionsRepository.findById(sessionId, status);

        if (!session) throw new NotFoundException('Sessão não encontrada.');

        return {
            session: {
                ...session,
                sessionSeats: undefined,
            },
            seats: session.sessionSeats,
        };
    }
    async findAll() {
        return this.sessionsRepository.findAll();
    }

    async findById(id: string) {
        const session = await this.sessionsRepository.findById(id);
        if (!session) {
            throw new NotFoundException(`Sessão com ID ${id} não encontrada.`);
        }
        return session;
    }
}
