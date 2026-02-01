import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsRepository } from './reservations.repository';
import { ReservationExpirationService } from './reservation-expiration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [PrismaModule, RedisModule, KafkaModule],
  controllers: [ReservationsController],
  exports: [ReservationsRepository],
  providers: [ReservationsService, ReservationsRepository, ReservationExpirationService],
})
export class ReservationsModule {}
