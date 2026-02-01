
const axios = require('axios'); // Need to install axios if not present, or use fetch
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:3000';
const CONCURRENT_USERS = 40; // 40 users (to stay under Rate Limit 100)
const TOTAL_INSTANCES = 10;
const AVAILABLE_SEATS_TO_FIGHT_FOR = 2; // We will target 2 specific seats

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('1- Starting Distributed Concurrency Simulation');
    console.log(`2- Configuration: ${CONCURRENT_USERS} users fighting for ${AVAILABLE_SEATS_TO_FIGHT_FOR} seats`);
    console.log(`3- Infrastructure: Targeting Load Balancer (balancing across ${TOTAL_INSTANCES} instances)`);

    // 1. Create Data Setup
    console.log('\n[1] Finding Seeded Room/Session...');

    let roomId;
    let sessionId;
    let targetSeatIds = [];

    try {
        // Find existing room from Seed
        const roomsRes = await axios.get(`${BASE_URL}/rooms`);
        const seededRoom = roomsRes.data.find(r => r.name === 'Sala 01 - IMAX Extreme');

        if (seededRoom) {
            roomId = seededRoom.id;
            console.log(`✅ Using Seeded Room: ${roomId}`);
        } else {
            console.log('⚠️ Seeded room not found, attempting to create one (but might fail if no seats created manually script side yet)');
            // Fallback to creation if needed, but better to fail if seed didn't run
            throw new Error('Please run "npm run seed" first to prepare the arena!');
        }

        // Find existing session or create one for this room
        // Actually, seed creates a session too. Let's use it if available, or create a NEW session in that same room.
        // Creating a new session is better to have fresh seats.

        console.log('Creating new Session in the seeded room...');
        const sessionRes = await axios.post(`${BASE_URL}/sessions`, {
            movieTitle: `Jogos Vorazes: A Competição ${Date.now()}`,
            startShowTime: new Date(Date.now() + 86400000).toISOString(),
            endShowTime: new Date(Date.now() + 90000000).toISOString(),
            roomId: roomId,
            ticketPrice: 50.00
        });
        sessionId = sessionRes.data.id;
        console.log(`✅ Session Created: ${sessionId}`);

        // Get Available Seats for this NEW session
        const seatsRes = await axios.get(`${BASE_URL}/sessions/${sessionId}/seats`);
        const seatsList = Array.isArray(seatsRes.data) ? seatsRes.data : (seatsRes.data.seats || []);

        if (seatsList.length < 2) {
            throw new Error('Not enough seats generated');
        }

        // We target the sessionSeatIds specifically
        // Assuming the list contains SessionSeat objects with 'id'
        const seat1 = seatsList.find(s => s.seat.seatNumber === 1);
        const seat2 = seatsList.find(s => s.seat.seatNumber === 2);

        targetSeatIds = [seat1.id, seat2.id];
        console.log(`⚔️  Targeting Session Seats: ${targetSeatIds.join(', ')}`);

    } catch (e) {
        console.error('❌ Setup Failed:', e.response?.data || e.message);
        process.exit(1);
    }

    // 2. The Attack
    console.log('\n[2] ⚔️  LAUNCHING CONCURRENT REQUESTS ⚔️');
    console.log(`...Simulating ${CONCURRENT_USERS} users pressing 'Reserve' EXACTLY at the same time...`);

    // We create a generic user for the simulation (or create one per request if needed)
    // The API requires userId. Let's create one "Base User" or multiple if we enabled Rate Limiting per User.
    // Since we enabled IP/User based Rate limit, effectively we might hit the limit if we look like 1 user.
    // BUT, we are calling from the script. We might need to spoof X-User-Id or create multiple users.
    // Let's create 20 users first to be realistic.

    const users = [];
    for (let i = 0; i < CONCURRENT_USERS; i++) {
        try {
            const u = await axios.post(`${BASE_URL}/users`, {
                name: `Gladiator ${i}`,
                email: `gladiator${i}_${Date.now()}@arena.com`
            });
            users.push(u.data.id);
        } catch (e) {
            console.error('Error creating user', e.message);
        }
    }
    console.log(`✅ ${users.length} Users prepared.`);

    const promises = users.map((userId, index) => {
        return axios.post(`${BASE_URL}/reservations`, {
            userId: userId,
            sessionId: sessionId,
            sessionSeatIds: targetSeatIds // EVERYONE tries to book BOTH seats
        }, {
            headers: {
                'x-idempotency-key': uuidv4() // Unique per attempt
            }
        })
            .then(res => ({
                status: 'SUCCESS',
                data: res.data,
                user: userId,
                worker: index,
                serverWorker: res.headers['x-worker-id']
            }))
            .catch(err => ({
                status: 'FAILED',
                error: err.response?.status,
                msg: err.response?.data?.message,
                user: userId,
                worker: index,
                serverWorker: err.response?.headers?.['x-worker-id']
            }));
    });

    const start = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    // 3. Analysis
    console.log(`\n[3] 📊 Analysis (Duration: ${duration}ms)`);

    const success = results.filter(r => r.status === 'SUCCESS');
    const failures = results.filter(r => r.status === 'FAILED');
    const conflicts = failures.filter(r => r.error === 409);
    const others = failures.filter(r => r.error !== 409);

    console.log(`\n🏆 Successful Reservations: ${success.length}`);
    if (success.length > 0) {
        success.forEach(s => console.log(`   - Worker ${s.worker} (Server: ${s.serverWorker}) got the seats! ID: ${s.data.id}`));
    }

    console.log(`🛡️  Blocked by Conflict (409): ${conflicts.length}`);
    console.log(`⚠️  Other Errors: ${others.length}`);
    others.forEach(o => console.log(`   - Worker ${o.worker}: Status ${o.error} - ${JSON.stringify(o.msg)}`));

    // Validation
    if (success.length > 1) {
        console.log(`\n❌ TEST FAILED: Double Booking Detected! (${success.length} successes)`);
        console.log('   CRITICAL: The system sold the same seats to multiple people!');
    } else if (success.length === 1) {
        console.log('\n✅ TEST PASSED: Perfect Concurrency Control!');
        console.log(`   Only 1 user managed to book. ${conflicts.length} were conflicted (409) and ${others.length} were throttled/errored.`);
    } else {
        console.log('\n❌ TEST FAILED: No one managed to book? Something might be broken (or all throttled).');
    }
}

main();
