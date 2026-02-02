import { Injectable, NotFoundException } from '@nestjs/common';
import { RoomsRepository } from './rooms.repository';
import type { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly repository: RoomsRepository) { }

  async create(createRoomDto: CreateRoomDto) {
    return this.repository.create({
      ...createRoomDto,
      status: 'ACTIVE',
    });
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const room = await this.repository.findById(id);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }
}
