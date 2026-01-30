-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- AlterTable: Prepare sessions table
ALTER TABLE "sessions" 
  ADD COLUMN "room_id" TEXT,
  ADD COLUMN "start_show_time" TIMESTAMP(3),
  ADD COLUMN "end_show_time" TIMESTAMP(3),
  ALTER COLUMN "ticket_price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable: Prepare seats table
ALTER TABLE "seats" 
  ADD COLUMN "room_id" TEXT;

-- AlterTable: Prepare sales table
ALTER TABLE "sales" 
  ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(10,2);

-- CreateTable: rooms
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

-- ===================================================================
-- DATA MIGRATION: Migrate existing sessions and seats to new schema
-- ===================================================================

-- Step 1: Create rooms from existing session room names
INSERT INTO "rooms" ("id", "name", "capacity", "status", "created_at", "updated_at")
SELECT 
    gen_random_uuid(),
    "room_name",
    40,
    'ACTIVE'::"RoomStatus",
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "room_name"
    FROM "sessions"
    WHERE "room_name" IS NOT NULL
) AS distinct_rooms
ON CONFLICT ("name") DO NOTHING;

-- Step 2: Update sessions with room_id and time fields
UPDATE "sessions" s
SET 
    "room_id" = r."id",
    "start_show_time" = s."show_time",
    "end_show_time" = s."show_time" + INTERVAL '2 hours'
FROM "rooms" r
WHERE r."name" = s."room_name";

-- Step 3: Update seats with room_id based on their session
UPDATE "seats" st
SET "room_id" = (
    SELECT s."room_id"
    FROM "sessions" s
    WHERE s."id" = st."session_id"
);

-- ===================================================================
-- CLEANUP: Drop old columns and add constraints
-- ===================================================================

-- Drop old columns from sessions
ALTER TABLE "sessions" 
  DROP COLUMN "room_name",
  DROP COLUMN "show_time";

-- Make new columns NOT NULL after data migration
ALTER TABLE "sessions"
  ALTER COLUMN "room_id" SET NOT NULL,
  ALTER COLUMN "start_show_time" SET NOT NULL,
  ALTER COLUMN "end_show_time" SET NOT NULL;

-- Drop old unique constraint from seats
ALTER TABLE "seats" DROP CONSTRAINT IF EXISTS "seats_session_id_row_label_seat_number_key";

-- Drop old column from seats
ALTER TABLE "seats" DROP COLUMN "session_id";

-- Make room_id NOT NULL after data migration
ALTER TABLE "seats" ALTER COLUMN "room_id" SET NOT NULL;

-- CreateIndex: New unique constraint for seats
CREATE UNIQUE INDEX "seats_room_id_row_label_seat_number_key" ON "seats"("room_id", "row_label", "seat_number");

-- CreateIndex: Performance index for session conflicts
CREATE INDEX "sessions_room_id_start_show_time_end_show_time_idx" ON "sessions"("room_id", "start_show_time", "end_show_time");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
