import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';
import { Session, Seat, SeatStatus, Prisma } from '@prisma/client';
import { SessionsRepository } from './sessions.repository';

@Injectable()
export class SessionsService {
    constructor(private readonly sessionsRepository: SessionsRepository) { }

    async create(createSessionDto: CreateSessionDto): Promise<Session & { seats: Seat[] }> {
        const { rows, seatsPerRow, ...sessionData } = createSessionDto;

        const totalSeats = rows * seatsPerRow;
        if (totalSeats < 16) {
            throw new BadRequestException(
                `A session must have at least 16 seats. Current: ${rows} rows × ${seatsPerRow} seats = ${totalSeats}`,
            );
        }

        const seatsData: Array<{ rowLabel: string; seatNumber: number; status: SeatStatus }> = [];

        for (let row = 0; row < rows; row++) {
            const rowLabel = String.fromCharCode(65 + row);
            for (let seat = 1; seat <= seatsPerRow; seat++) {
                seatsData.push({
                    rowLabel,
                    seatNumber: seat,
                    status: SeatStatus.AVAILABLE,
                });
            }
        }

        return this.sessionsRepository.createWithSeats(
            {
                movieTitle: sessionData.movieTitle,
                showTime: new Date(sessionData.showTime),
                roomName: sessionData.roomName,
                ticketPrice: new Prisma.Decimal(sessionData.ticketPrice),
            },
            seatsData,
        );
    }

    async findAll(): Promise<Session[]> {
        return this.sessionsRepository.findAll();
    }

    async findById(id: string): Promise<Session> {
        const session = await this.sessionsRepository.findById(id);

        if (!session) {
            throw new NotFoundException(`Session with ID ${id} not found`);
        }

        return session;
    }

    async getSeats(sessionId: string, status?: SeatStatus) {
        await this.findById(sessionId);

        const seats = await this.sessionsRepository.findSeats(sessionId, status);

        const available = seats.filter((s) => s.status === SeatStatus.AVAILABLE).length;
        const reserved = seats.filter((s) => s.status === SeatStatus.RESERVED).length;
        const sold = seats.filter((s) => s.status === SeatStatus.SOLD).length;

        return {
            sessionId,
            seats,
            statistics: {
                total: seats.length,
                available,
                reserved,
                sold,
            },
        };
    }

    async getAvailableSeats(sessionId: string) {
        return this.getSeats(sessionId, SeatStatus.AVAILABLE);
    }
}
