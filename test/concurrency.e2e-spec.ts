import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Disable Kafka consumer in tests
process.env.KAFKA_CONSUMER_ENABLED = 'false';

describe('Concurrency Tests (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.$executeRaw`TRUNCATE TABLE sales, reservation_seats, reservations, seats, sessions, users CASCADE`;
  });

  describe('Race Condition: Multiple users reserving the same seat', () => {
    it('should allow only ONE reservation when 10 users try to reserve the same seat simultaneously', async () => {
      // 1. Create a user
      const userResponse = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'test@example.com', name: 'Test User' })
        .expect(201);

      const userId = userResponse.body.id;

      // 2. Create a session with 16 seats
      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Race Condition Test',
          showTime: new Date(Date.now() + 86400000).toISOString(),
          roomName: 'Sala Test',
          ticketPrice: 25.0,
          rows: 4,
          seatsPerRow: 4,
        })
        .expect(201);

      const sessionId = sessionResponse.body.id;
      const seatId = sessionResponse.body.seats[0].id;

      // 3. Simulate 10 concurrent reservation attempts for the SAME seat
      const concurrentRequests = Array(10)
        .fill(null)
        .map((_, index) =>
          request(app.getHttpServer())
            .post('/reservations')
            .set('X-Idempotency-Key', `concurrent-${index}`)
            .send({
              userId,
              sessionId,
              seatIds: [seatId],
            }),
        );

      const results = await Promise.all(concurrentRequests);

      // 4. Count successful reservations (201) and conflicts (409)
      const successful = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      // Exactly ONE should succeed
      expect(successful.length).toBe(1);
      // The rest should fail with conflict
      expect(conflicts.length).toBe(9);

      // 5. Verify only one reservation exists in database
      const reservations = await prisma.reservation.findMany({
        where: { sessionId },
      });
      expect(reservations.length).toBe(1);

      // 6. Verify seat status is RESERVED
      const seat = await prisma.seat.findUnique({ where: { id: seatId } });
      expect(seat?.status).toBe('RESERVED');
    });

    it('should prevent double-selling a seat after payment confirmation', async () => {
      // 1. Create user and session
      const userResponse = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'double-sell@test.com', name: 'Double Sell Test' });

      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Double Sell Test',
          showTime: new Date(Date.now() + 86400000).toISOString(),
          roomName: 'Sala Test',
          ticketPrice: 30.0,
          rows: 4,
          seatsPerRow: 4,
        });

      const userId = userResponse.body.id;
      const sessionId = sessionResponse.body.id;
      const seatId = sessionResponse.body.seats[0].id;

      // 2. Create first reservation
      const reservation1 = await request(app.getHttpServer())
        .post('/reservations')
        .send({ userId, sessionId, seatIds: [seatId] })
        .expect(201);

      // 3. Confirm payment
      await request(app.getHttpServer())
        .post(`/reservations/${reservation1.body.id}/confirm`)
        .expect(201);

      // 4. Try to reserve the same seat again
      const reservation2 = await request(app.getHttpServer())
        .post('/reservations')
        .send({ userId, sessionId, seatIds: [seatId] });

      expect(reservation2.status).toBe(409);

      // 5. Verify seat is SOLD
      const seat = await prisma.seat.findUnique({ where: { id: seatId } });
      expect(seat?.status).toBe('SOLD');
    });
  });

  describe('Idempotency', () => {
    it('should return the same reservation for duplicate idempotency key', async () => {
      // Setup
      const userResponse = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'idempotent@test.com', name: 'Idempotent User' });

      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Idempotency Test',
          showTime: new Date(Date.now() + 86400000).toISOString(),
          roomName: 'Sala Test',
          ticketPrice: 25.0,
          rows: 4,
          seatsPerRow: 4,
        });

      const userId = userResponse.body.id;
      const sessionId = sessionResponse.body.id;
      const seatId = sessionResponse.body.seats[0].id;
      const idempotencyKey = 'unique-idempotency-key-123';

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/reservations')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ userId, sessionId, seatIds: [seatId] })
        .expect(201);

      // Second request with same key
      const response2 = await request(app.getHttpServer())
        .post('/reservations')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ userId, sessionId, seatIds: [seatId] })
        .expect(201);

      // Should return the same reservation
      expect(response1.body.id).toBe(response2.body.id);

      // Only one reservation should exist
      const reservations = await prisma.reservation.findMany({
        where: { sessionId },
      });
      expect(reservations.length).toBe(1);
    });
  });

  describe('Deadlock Prevention', () => {
    it('should handle overlapping seat reservations without deadlock', async () => {
      // Setup
      const userResponse = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'deadlock@test.com', name: 'Deadlock Test' });

      const sessionResponse = await request(app.getHttpServer())
        .post('/sessions')
        .send({
          movieTitle: 'Deadlock Test',
          showTime: new Date(Date.now() + 86400000).toISOString(),
          roomName: 'Sala Test',
          ticketPrice: 25.0,
          rows: 4,
          seatsPerRow: 4,
        });

      const userId = userResponse.body.id;
      const sessionId = sessionResponse.body.id;
      const seats = sessionResponse.body.seats;

      // User A tries to reserve [seat1, seat3]
      // User B tries to reserve [seat3, seat1] (opposite order)
      const seatA1 = seats[0].id;
      const seatA3 = seats[2].id;

      const requestA = request(app.getHttpServer())
        .post('/reservations')
        .set('X-Idempotency-Key', 'user-a-key')
        .send({ userId, sessionId, seatIds: [seatA1, seatA3] });

      const requestB = request(app.getHttpServer())
        .post('/reservations')
        .set('X-Idempotency-Key', 'user-b-key')
        .send({ userId, sessionId, seatIds: [seatA3, seatA1] });

      const [responseA, responseB] = await Promise.all([requestA, requestB]);

      // One should succeed, one should fail (conflict)
      const statuses = [responseA.status, responseB.status].sort();
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      // Verify only one reservation exists
      const reservations = await prisma.reservation.findMany({
        where: { sessionId },
      });
      expect(reservations.length).toBe(1);
    });
  });
});
