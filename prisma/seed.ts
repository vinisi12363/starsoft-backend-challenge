
import { PrismaClient, RoomStatus, SeatStatus, ReservationStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Clean up existing data (optional, but good for idempotent runs)
    // Be careful in production!
    await prisma.reservationSeat.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.session.deleteMany();
    await prisma.seat.deleteMany();
    await prisma.room.deleteMany();
    await prisma.user.deleteMany();

    console.log('🧹 Cleaned up database.');

    // 2. Create Rooms
    const roomsData = [
        { name: 'Sala 1 - Standard', capacity: 16 },
        { name: 'Sala 2 - VIP', capacity: 16 },
        { name: 'Sala 3 - IMAX', capacity: 16 },
    ];

    const createdRooms = [];

    for (const r of roomsData) {
        const room = await prisma.room.create({
            data: {
                name: r.name,
                capacity: r.capacity,
                status: RoomStatus.ACTIVE,
            },
        });
        createdRooms.push(room);
        console.log(`Created Room: ${room.name}`);

        // 3. Create Seats for each Room
        // Simple layout: 10 seats per row
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const seatsPerRow = Math.ceil(r.capacity / rows.length); // Approximate logic

        let seatsCreatedCount = 0;
        for (let i = 0; i < rows.length; i++) {
            // limit rows if capacity is small
            if (seatsCreatedCount >= r.capacity) break;

            const row = rows[i];
            for (let num = 1; num <= 10; num++) {
                if (seatsCreatedCount >= r.capacity) break;

                await prisma.seat.create({
                    data: {
                        roomId: room.id,
                        rowLabel: row,
                        seatNumber: num,
                        status: SeatStatus.AVAILABLE,
                    },
                });
                seatsCreatedCount++;
            }
        }
        console.log(` - Created ${seatsCreatedCount} seats for ${room.name}`);
    }

    // 4. Create Users
    const user1 = await prisma.user.create({
        data: {
            email: 'john.doe@example.com',
            name: 'John Doe',
        },
    });

    const user2 = await prisma.user.create({
        data: {
            email: 'jane.smith@example.com',
            name: 'Jane Smith',
        },
    });

    console.log('Did created users:', user1.email, user2.email);

    // 5. Create Sessions (Movies)
    // Current year is 2026. Let's schedule some for "tomorrow" and "next week".
    const now = new Date(); // 2026...
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 0, 0, 0); // 19:00

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(21, 0, 0, 0); // 21:00

    const session1 = await prisma.session.create({
        data: {
            roomId: createdRooms[0].id, // Sala 1
            movieTitle: 'O Senhor dos Anéis: A Sociedade do Anel (4K Remaster)',
            startShowTime: tomorrow,
            endShowTime: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000), // +3h
            ticketPrice: 25.50,
        },
    });

    const session2 = await prisma.session.create({
        data: {
            roomId: createdRooms[2].id, // IMAX
            movieTitle: 'Interestelar (IMAX Exclusive)',
            startShowTime: nextWeek,
            endShowTime: new Date(nextWeek.getTime() + 2 * 60 * 60 * 1000 + 49 * 60 * 1000), // +2h 49m
            ticketPrice: 45.00,
        },
    });

    console.log('Created Sessions:', session1.movieTitle, session2.movieTitle);

    // 6. Create a Sale (Simulated)
    // User 1 buys a ticket for Session 1

    // Find a seat
    const seatToBook = await prisma.seat.findFirst({
        where: { roomId: session1.roomId, rowLabel: 'D', seatNumber: 5 }
    });

    if (seatToBook) {
        // Create Reservation first
        const reservation = await prisma.reservation.create({
            data: {
                userId: user1.id,
                sessionId: session1.id,
                status: ReservationStatus.CONFIRMED,
                expiresAt: new Date(new Date().getTime() + 1000 * 60 * 10), // expired in 10m (doesn't matter if confirmed)
                idempotencyKey: uuidv4(),
                reservationSeats: {
                    create: {
                        seatId: seatToBook.id
                    }
                }
            }
        });

        // Create Sale
        await prisma.sale.create({
            data: {
                id: uuidv4(),
                reservationId: reservation.id,
                userId: user1.id,
                totalAmount: session1.ticketPrice,
                confirmedAt: new Date(),
            }
        });

        // Update seat status
        await prisma.seat.update({
            where: { id: seatToBook.id },
            data: { status: SeatStatus.SOLD }
        });

        console.log(`Created simulated sale for ${user1.name} watching ${session1.movieTitle}`);
    }

    console.log('✅ Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
