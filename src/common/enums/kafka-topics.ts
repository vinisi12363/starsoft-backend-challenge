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
