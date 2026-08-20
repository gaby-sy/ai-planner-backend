-- CreateEnum
CREATE TYPE "GoogleCalendarSyncStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'SYNCING', 'ERROR');

-- CreateTable
CREATE TABLE "google_calendar_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "GoogleCalendarSyncStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "google_email" TEXT,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "google_calendar_id" TEXT DEFAULT 'primary',
    "sync_token" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_integrations_user_id_key" ON "google_calendar_integrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_user_id_external_id_key" ON "calendar_events"("user_id", "external_id");

-- AddForeignKey
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
