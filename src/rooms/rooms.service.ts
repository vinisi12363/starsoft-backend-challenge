import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRoomDto: CreateRoomDto) {
    return this.prisma.room.create({
      data: {
        ...createRoomDto,
        status: 'ACTIVE', // Default status from Enum
      },
    });
  }

  async findAll() {
    return this.prisma.room.findMany();
  }

  async findById(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { seats: true }, // Include physical seats if useful
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }
}
