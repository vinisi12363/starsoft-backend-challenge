import { Injectable, type OnModuleInit, type OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, type Producer, type Consumer, type EachMessagePayload, logLevel } from 'kafkajs';

export interface KafkaMessage<T = unknown> {
  topic: string;
  key?: string;
  value: T;
  headers?: Record<string, string>;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumers: Map<string, Consumer> = new Map();
  private readonly logger = new Logger(KafkaService.name);

  constructor(private readonly configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('KAFKA_CLIENT_ID', 'cinema-api'),
      brokers: this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092').split(','),
      logLevel: logLevel.WARN,
    });

    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();

    for (const [groupId, consumer] of this.consumers) {
      await consumer.disconnect();
      this.logger.log(`Kafka consumer ${groupId} disconnected`);
    }
  }

  /**
   * Publica uma mensagem em um tópico Kafka
   */
  async emit<T>(topic: string, message: T, key?: string): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: key ?? undefined,
            value: JSON.stringify(message),
            headers: {
              timestamp: Date.now().toString(),
            },
          },
        ],
      });

      this.logger.debug(`Message published to ${topic}`, { key });
    } catch (error) {
      this.logger.error(`Failed to publish message to ${topic}`, error);
      throw error;
    }
  }

  /**
   * Publica múltiplas mensagens em um tópico Kafka
   */
  async emitBatch<T>(topic: string, messages: Array<{ value: T; key?: string }>): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: messages.map((msg) => ({
          key: msg.key ?? undefined,
          value: JSON.stringify(msg.value),
          headers: {
            timestamp: Date.now().toString(),
          },
        })),
      });

      this.logger.debug(`Batch of ${messages.length} messages published to ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to publish batch to ${topic}`, error);
      throw error;
    }
  }

  /**
   * Cria um consumer para um grupo específico
   */
  async createConsumer(groupId: string): Promise<Consumer> {
    if (this.consumers.has(groupId)) {
      return this.consumers.get(groupId)!;
    }

    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    this.consumers.set(groupId, consumer);

    this.logger.log(`Kafka consumer created for group: ${groupId}`);
    return consumer;
  }

  /**
   * Subscreve a um tópico e processa mensagens
   */
  async subscribe<T>(
    groupId: string,
    topic: string,
    handler: (message: T, payload: EachMessagePayload) => Promise<void>,
  ): Promise<void> {
    const consumer = await this.createConsumer(groupId);

    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      eachMessage: async (payload) => {
        const { message } = payload;
        let value = null;
        try {
          value = message.value ? (JSON.parse(message.value.toString()) as T) : null;

          if (value) {
            await handler(value, payload);
            this.logger.debug(`Message processed from ${topic}`);
          }
        } catch (error) {
          this.logger.error(`Error processing message from ${topic}`, error);
          await this.emit(
            `${topic}-dlq`,
            {
              originalMessage: value,
              error: error.message,
            },
            message.key?.toString(),
          );
        }
      },
    });

    this.logger.log(`Subscribed to topic: ${topic} with group: ${groupId}`);
  }
}
