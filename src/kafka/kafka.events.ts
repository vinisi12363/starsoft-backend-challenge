// Kafka Topics
export const KAFKA_TOPICS = {
  RESERVATIONS: 'cinema.reservations',
  SALES: 'cinema.sales',
  SEATS: 'cinema.seats',
} as const;

// Kafka Event Types
export const RESERVATION_EVENTS = {
  CREATED: 'reservation.created',
  EXPIRED: 'reservation.expired',
  CANCELLED: 'reservation.cancelled',
  CONFIRMED: 'reservation.confirmed',
} as const;

export const SALE_EVENTS = {
  PAYMENT_CONFIRMED: 'payment.confirmed',
} as const;

export const SEAT_EVENTS = {
  RELEASED: 'seat.released',
  SOLD: 'seat.sold',
} as const;

// Event Payloads
export interface ReservationCreatedEvent {
  eventType: typeof RESERVATION_EVENTS.CREATED;
  reservationId: string;
  userId: string;
  sessionId: string;
  seatIds: string[];
  expiresAt: Date;
  createdAt: Date;
}

export interface ReservationExpiredEvent {
  eventType: typeof RESERVATION_EVENTS.EXPIRED;
  reservationId: string;
  userId: string;
  sessionId: string;
  seatIds: string[];
  expiredAt: Date;
}

export interface ReservationCancelledEvent {
  eventType: typeof RESERVATION_EVENTS.CANCELLED;
  reservationId: string;
  reason: string;
  cancelledAt: Date;
}

export interface PaymentConfirmedEvent {
  eventType: typeof SALE_EVENTS.PAYMENT_CONFIRMED;
  saleId: string;
  reservationId: string;
  userId: string;
  totalAmount: number;
  confirmedAt: Date;
}

export interface SeatReleasedEvent {
  eventType: typeof SEAT_EVENTS.RELEASED;
  sessionId: string;
  seatIds: string[];
  reason: 'expired' | 'cancelled';
  releasedAt: Date;
}

export interface SeatSoldEvent {
  eventType: typeof SEAT_EVENTS.SOLD;
  sessionId: string;
  seatIds: string[];
  saleId: string;
  soldAt: Date;
}

export type ReservationEvent =
  | ReservationCreatedEvent
  | ReservationExpiredEvent
  | ReservationCancelledEvent;

export type SaleEvent = PaymentConfirmedEvent;

export type SeatEvent = SeatReleasedEvent | SeatSoldEvent;
