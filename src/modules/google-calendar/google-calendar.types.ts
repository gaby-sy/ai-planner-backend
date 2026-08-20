import { GoogleCalendarSyncStatus } from '@prisma/client';

/**
 * Shape returned to API clients — mirrors the frontend's
 * `GoogleCalendarIntegration` model. Never includes tokens.
 */
export interface GoogleCalendarIntegrationView {
  connected: boolean;
  status: GoogleCalendarSyncStatus;
  googleEmail?: string;
  lastSyncedAt?: string;
  syncError?: string;
  createdAt?: string;
  updatedAt?: string;
}
