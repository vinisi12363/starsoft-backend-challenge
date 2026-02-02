import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomsRepository } from './rooms.repository';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsRepository],
})
export class RoomsModule { }
