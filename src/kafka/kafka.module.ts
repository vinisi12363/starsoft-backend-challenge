import { Global, Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { KafkaConsumerService } from './kafka-consumer.service';

@Global()
@Module({
    providers: [KafkaService, KafkaConsumerService],
    exports: [KafkaService],
})
export class KafkaModule { }
