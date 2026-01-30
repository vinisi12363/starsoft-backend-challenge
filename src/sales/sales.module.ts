import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesRepository } from './sales.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
    imports: [PrismaModule, KafkaModule],
    controllers: [SalesController],
    providers: [SalesService, SalesRepository],
})
export class SalesModule { }
