import { Injectable, type OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';
import {
  type ReservationCreatedEvent,
  type ReservationExpiredEvent,
  type ReservationCancelledEvent,
  type PaymentConfirmedEvent,
  type SeatReleasedEvent,
  type SeatSoldEvent,
} from './kafka.events';
import { KAFKA_TOPICS, RESERVATION_EVENTS, SALE_EVENTS, SEAT_EVENTS } from 'src/common/enums/kafka-topics';

@Injectable()
export class KafkaConsumerService implements OnModuleInit {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
  ) {
    this.enabled = this.configService.get<string>('KAFKA_CONSUMER_ENABLED', 'true') === 'true';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Kafka consumer is disabled');
      return;
    }

    await this.subscribeToReservationEvents();
    await this.subscribeToSaleEvents();
    await this.subscribeToSeatEvents();
  }

  private async subscribeToReservationEvents(): Promise<void> {
    const groupId = 'cinema-reservation-consumer';

    await this.kafkaService.subscribe<
      ReservationCreatedEvent | ReservationExpiredEvent | ReservationCancelledEvent
    >(groupId, KAFKA_TOPICS.RESERVATIONS, async (event) => {
      switch (event.eventType) {
        case RESERVATION_EVENTS.CREATED:
          await this.handleReservationCreated(event as ReservationCreatedEvent);
          break;
        case RESERVATION_EVENTS.EXPIRED:
          await this.handleReservationExpired(event as ReservationExpiredEvent);
          break;
        case RESERVATION_EVENTS.CANCELLED:
          this.logger.log(
            `Reservation cancelled: ${(event as ReservationCancelledEvent).reservationId}`,
          );
          break;
        default:
          this.logger.warn(`Unknown reservation event type: ${(event as any).eventType}`);
      }
    });
  }

  private async subscribeToSaleEvents(): Promise<void> {
    const groupId = 'cinema-sale-consumer';

    await this.kafkaService.subscribe<PaymentConfirmedEvent>(
      groupId,
      KAFKA_TOPICS.SALES,
      async (event) => {
        if (event.eventType === SALE_EVENTS.PAYMENT_CONFIRMED) {
          await this.handlePaymentConfirmed(event);
        }
      },
    );
  }

  private async subscribeToSeatEvents(): Promise<void> {
    const groupId = 'cinema-seat-consumer';

    await this.kafkaService.subscribe<SeatReleasedEvent | SeatSoldEvent>(
      groupId,
      KAFKA_TOPICS.SEATS,
      async (event) => {
        switch (event.eventType) {
          case SEAT_EVENTS.RELEASED:
            await this.handleSeatReleased(event as SeatReleasedEvent);
            break;
          case SEAT_EVENTS.SOLD:
            await this.handleSeatSold(event as SeatSoldEvent);
            break;
          default:
            this.logger.warn(`Unknown seat event type: ${(event as any).eventType}`);
        }
      },
    );
  }

  private async handleReservationCreated(event: ReservationCreatedEvent): Promise<void> {
    this.logger.log(
      `Reservation created: ${event.reservationId} | ` +
      `User: ${event.userId} | ` +
      `Session: ${event.sessionId} | ` +
      `Seats: ${event.seatIds.length} | ` +
      `Expires: ${new Date(event.expiresAt).toISOString()}`,
    );
  }

  private async handleReservationExpired(event: ReservationExpiredEvent): Promise<void> {
    this.logger.log(
      `Reservation expired: ${event.reservationId} | ` +
      `User: ${event.userId} | ` +
      `Session: ${event.sessionId} | ` +
      `Seats released: ${event.seatIds.length}`,
    );
  }

  private async handlePaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
    this.logger.log(
      `Payment confirmed: Sale ${event.saleId} | ` +
      `Reservation: ${event.reservationId} | ` +
      `User: ${event.userId} | ` +
      `Amount: R$${event.totalAmount.toFixed(2)}`,
    );
  }

  private async handleSeatReleased(event: SeatReleasedEvent): Promise<void> {
    this.logger.log(
      `Seats released: Session ${event.sessionId} | ` +
      `Seats: ${event.seatIds.length} | ` +
      `Reason: ${event.reason}`,
    );
  }

  private async handleSeatSold(event: SeatSoldEvent): Promise<void> {
    this.logger.log(
      `Seats sold: Session ${event.sessionId} | ` +
      `Seats: ${event.seatIds.length} | ` +
      `Sale: ${event.saleId}`,
    );
  }
}
