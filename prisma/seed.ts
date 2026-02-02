import { PrismaClient, RoomStatus, SeatStatus, ReservationStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Starting distributed-ready seed...');

    // 1. Limpeza (Ordem reversa das FKs para não dar erro)
    await prisma.sale.deleteMany();
    await prisma.reservationSeat.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.sessionSeat.deleteMany(); // Nova tabela
    await prisma.session.deleteMany();
    await prisma.seat.deleteMany();
    await prisma.room.deleteMany();
    await prisma.user.deleteMany();

    console.log('🧹 Database clean.');

    // 2. Criar Usuários
    const users = await Promise.all([
        prisma.user.create({
            data: {
                email: 'maria.silva@email.com',
                name: 'Maria Silva',
            },
        }),
        prisma.user.create({
            data: {
                email: 'joao.santos@email.com',
                name: 'João Santos',
            },
        }),
        prisma.user.create({
            data: {
                email: 'ana.oliveira@email.com',
                name: 'Ana Oliveira',
            },
        }),
        prisma.user.create({
            data: {
                email: 'carlos.souza@email.com',
                name: 'Carlos Souza',
            },
        }),
        prisma.user.create({
            data: {
                email: 'juliana.costa@email.com',
                name: 'Juliana Costa',
            },
        }),
    ]);

    const user = users[0];

    // 3. Criar Sala (O Molde Físico)
    const room = await prisma.room.create({
        data: {
            name: 'Sala 01 - IMAX Extreme',
            capacity: 20,
            status: RoomStatus.ACTIVE,
        },
    });

    // 4. Criar Assentos Físicos (As coordenadas fixas)
    const rows = ['A', 'B'];
    const seatsPerSide = 10;
    const seatIds: string[] = [];

    for (const row of rows) {
        for (let num = 1; num <= seatsPerSide; num++) {
            const seat = await prisma.seat.create({
                data: {
                    roomId: room.id,
                    rowLabel: row,
                    seatNumber: num,
                    // Note: Não existe mais 'status' aqui!
                },
            });
            seatIds.push(seat.id);
        }
    }
    console.log(`✅ Room and ${seatIds.length} physical seats created.`);

    // 5. Criar Sessão (O Evento)
    const startTime = new Date('2026-02-01T19:00:00Z');
    const session = await prisma.session.create({
        data: {
            roomId: room.id,
            movieTitle: 'Interstellar 2: The Return',
            startShowTime: startTime,
            endShowTime: new Date(startTime.getTime() + 3 * 60 * 60 * 1000),
            ticketPrice: 35.00,
        },
    });

    // 6. INSTANCIAR SessionSeats (O Pulo do Gato 🐈)
    // Para cada assento físico da sala, criamos um estado "AVAILABLE" nesta sessão.
    await prisma.sessionSeat.createMany({
        data: seatIds.map((id) => ({
            sessionId: session.id,
            seatId: id,
            status: SeatStatus.AVAILABLE,
            version: 0, // Inicia o controle de concorrência
        })),
    });
    console.log(`✅ Session instantiated with its own seat states.`);

    // 7. Simular uma Reserva e Venda (Fluxo Novo)
    // Vamos pegar o assento A1 desta sessão específica
    const targetSessionSeat = await prisma.sessionSeat.findFirst({
        where: {
            sessionId: session.id,
            seat: { rowLabel: 'A', seatNumber: 1 }
        },
        include: { seat: true }
    });

    if (targetSessionSeat) {
        const reservation = await prisma.reservation.create({
            data: {
                userId: user.id,
                sessionId: session.id,
                status: ReservationStatus.CONFIRMED,
                expiresAt: new Date(Date.now() + 1000 * 60 * 30),
                idempotencyKey: uuidv4(),
                reservationSeats: {
                    create: {
                        sessionSeatId: targetSessionSeat.id // Aponta para a SessionSeat!
                    }
                }
            }
        });

        // Marcar o assento da sessão como vendido
        await prisma.sessionSeat.update({
            where: { id: targetSessionSeat.id },
            data: {
                status: SeatStatus.SOLD,
                version: { increment: 1 } // Simula o update de concorrência
            }
        });

        await prisma.sale.create({
            data: {
                reservationId: reservation.id,
                userId: user.id,
                totalAmount: 35.00,
                confirmedAt: new Date(),
            }
        });

        console.log(`🚀 Success: Seat ${targetSessionSeat.seat.rowLabel}${targetSessionSeat.seat.seatNumber} sold for ${session.movieTitle}`);
    }

    console.log('✨ Seed finished successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });