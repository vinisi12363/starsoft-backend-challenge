import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';
import {
    KAFKA_TOPICS,
    ReservationCreatedEvent,
    ReservationExpiredEvent,
    ReservationCancelledEvent,
    PaymentConfirmedEvent,
    SeatReleasedEvent,
    SeatSoldEvent,
    RESERVATION_EVENTS,
    SALE_EVENTS,
    SEAT_EVENTS,
} from './kafka.events';

/**
 * Kafka Event Consumer Service
 *
 * Consumes events from Kafka topics and processes them accordingly.
 * This demonstrates async event processing capabilities of the system.
 *
 * Events consumed:
 * - reservation.created: Log new reservations
 * - reservation.expired: Handle expired reservation cleanup
 * - payment.confirmed: Process confirmed payments
 * - seat.released: Update analytics on seat releases
 * - seat.sold: Update analytics on seat sales
 */
@Injectable()
export class KafkaConsumerService implements OnModuleInit {
    private readonly logger = new Logger(KafkaConsumerService.name);
    private readonly enabled: boolean;

    constructor(
        private readonly kafkaService: KafkaService,
        private readonly configService: ConfigService,
    ) {
        // Allow disabling consumer in test environment
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

    /**
     * Subscribe to reservation-related events
     */
    private async subscribeToReservationEvents(): Promise<void> {
        const groupId = 'cinema-reservation-consumer';

        await this.kafkaService.subscribe<ReservationCreatedEvent | ReservationExpiredEvent | ReservationCancelledEvent>(
            groupId,
            KAFKA_TOPICS.RESERVATIONS,
            async (event) => {
                switch (event.eventType) {
                    case RESERVATION_EVENTS.CREATED:
                        await this.handleReservationCreated(event as ReservationCreatedEvent);
                        break;
                    case RESERVATION_EVENTS.EXPIRED:
                        await this.handleReservationExpired(event as ReservationExpiredEvent);
                        break;
                    case RESERVATION_EVENTS.CANCELLED:
                        this.logger.log(`Reservation cancelled: ${(event as ReservationCancelledEvent).reservationId}`);
                        break;
                    default:
                        this.logger.warn(`Unknown reservation event type: ${(event as any).eventType}`);
                }
            },
        );
    }

    /**
     * Subscribe to sale-related events
     */
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

    /**
     * Subscribe to seat-related events
     */
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

    // ===========================================
    // Event Handlers
    // ===========================================

    private async handleReservationCreated(event: ReservationCreatedEvent): Promise<void> {
        this.logger.log(
            `Reservation created: ${event.reservationId} | ` +
            `User: ${event.userId} | ` +
            `Session: ${event.sessionId} | ` +
            `Seats: ${event.seatIds.length} | ` +
            `Expires: ${new Date(event.expiresAt).toISOString()}`,
        );

        // Here you could:
        // - Send notifications to the user
        // - Update real-time dashboards
        // - Trigger analytics tracking
    }

    private async handleReservationExpired(event: ReservationExpiredEvent): Promise<void> {
        this.logger.log(
            `Reservation expired: ${event.reservationId} | ` +
            `User: ${event.userId} | ` +
            `Session: ${event.sessionId} | ` +
            `Seats released: ${event.seatIds.length}`,
        );

        // Here you could:
        // - Notify user about expired reservation
        // - Update availability in real-time
        // - Track abandonment metrics
    }

    private async handlePaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
        this.logger.log(
            `Payment confirmed: Sale ${event.saleId} | ` +
            `Reservation: ${event.reservationId} | ` +
            `User: ${event.userId} | ` +
            `Amount: R$${event.totalAmount.toFixed(2)}`,
        );

        // Here you could:
        // - Send confirmation email
        // - Generate ticket PDF
        // - Update sales reports
        // - Trigger external integrations
    }

    private async handleSeatReleased(event: SeatReleasedEvent): Promise<void> {
        this.logger.log(
            `Seats released: Session ${event.sessionId} | ` +
            `Seats: ${event.seatIds.length} | ` +
            `Reason: ${event.reason}`,
        );

        // Here you could:
        // - Notify waitlisted users
        // - Update real-time seat map
    }

    private async handleSeatSold(event: SeatSoldEvent): Promise<void> {
        this.logger.log(
            `Seats sold: Session ${event.sessionId} | ` +
            `Seats: ${event.seatIds.length} | ` +
            `Sale: ${event.saleId}`,
        );

        // Here you could:
        // - Update occupancy analytics
        // - Update real-time seat map
    }
}
