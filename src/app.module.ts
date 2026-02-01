import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Core modules
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';

// Feature modules
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SalesModule } from './sales/sales.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Scheduler for expiration cron job
    ScheduleModule.forRoot(),

    // Rate Limiting (Default: 10 requests per 60 seconds globally, can be overridden)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Core infrastructure
    PrismaModule,
    RedisModule,
    KafkaModule,

    // Feature modules
    UsersModule,
    SessionsModule,
    ReservationsModule,
    SalesModule,
    RoomsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
