import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { CreateSessionDto } from './dto/create-session.dto';
import { Prisma } from '@prisma/client';
import { SessionsRepository } from './sessions.repository';
import type { SeatStatus } from '@prisma/client';

@Injectable()
export class SessionsService {
    constructor(private readonly repository: SessionsRepository) { }

    async create(dto: CreateSessionDto) {
        const room = await this.repository.findRoomWithSeats(dto.roomId);

        if (!room) throw new NotFoundException('Sala não encontrada.');

        if (room.seats.length < 16) {
            throw new BadRequestException(
                `A sala precisa ter no mínimo 16 assentos cadastrados. Atual: ${room.seats.length}`,
            );
        }

        return this.repository.createWithSeats(
            {
                movieTitle: dto.movieTitle,
                startShowTime: new Date(dto.startShowTime),
                endShowTime: new Date(dto.endShowTime),
                ticketPrice: new Prisma.Decimal(dto.ticketPrice),
                roomId: dto.roomId,
            },
            room.seats,
        );
    }

    async getSessionMap(sessionId: string, status?: SeatStatus) {
        const session = await this.repository.findById(sessionId, status);

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
        return this.repository.findAll();
    }

    async findById(id: string) {
        const session = await this.repository.findById(id);
        if (!session) {
            throw new NotFoundException(`Sessão com ID ${id} não encontrada.`);
        }
        return session;
    }
}
