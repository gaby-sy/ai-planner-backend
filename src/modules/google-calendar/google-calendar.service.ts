import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Auth, calendar_v3, google } from 'googleapis';
import { GoogleCalendarIntegration, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptToken, encryptToken } from './utils/token-encryption.util';
import { GoogleCalendarIntegrationView } from './google-calendar.types';
import { GoogleCalendarPlatform } from './dto/google-auth-url-query.dto';

const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

const OAUTH_STATE_TTL = '10m';

interface OAuthStatePayload {
  sub: string; // userId
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Status ─────────────────────────────────────────────────────

  async getStatus(userId: string): Promise<GoogleCalendarIntegrationView> {
    const record = await this.prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    return this.toView(record);
  }

  // ─── Auth URL ───────────────────────────────────────────────────

  async getAuthUrl(
    userId: string,
    redirectUri: string | undefined,
    platform: GoogleCalendarPlatform,
  ): Promise<{ url: string }> {
    if (platform === GoogleCalendarPlatform.MOBILE && !redirectUri) {
      throw new BadRequestException(
        'redirectUri is required for platform=mobile',
      );
    }

    const effectiveRedirectUri =
      platform === GoogleCalendarPlatform.MOBILE
        ? (redirectUri as string)
        : this.webCallbackUrl();

    const state = this.jwt.sign({ sub: userId } satisfies OAuthStatePayload, {
      secret: this.config.getOrThrow('GOOGLE_OAUTH_STATE_SECRET'),
      expiresIn: OAUTH_STATE_TTL,
    });

    const client = this.createOAuthClient(effectiveRedirectUri);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_CALENDAR_SCOPES,
      state,
    });

    return { url };
  }

  // ─── Connect (mobile: code exchanged directly by the app) ────────

  async connect(
    userId: string,
    code: string,
    redirectUri: string,
  ): Promise<GoogleCalendarIntegrationView> {
    const client = this.createOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    return this.persistTokensAndActivate(userId, client, tokens);
  }

  // ─── Web OAuth callback (Google redirects the browser here) ──────

  async handleWebCallback(code: string, state: string): Promise<void> {
    const payload = this.jwt.verify<OAuthStatePayload>(state, {
      secret: this.config.getOrThrow('GOOGLE_OAUTH_STATE_SECRET'),
    });

    const client = this.createOAuthClient(this.webCallbackUrl());
    const { tokens } = await client.getToken(code);
    await this.persistTokensAndActivate(payload.sub, client, tokens);
  }

  // ─── Sync ───────────────────────────────────────────────────────

  async sync(userId: string): Promise<GoogleCalendarIntegrationView> {
    const record = await this.prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    if (!record) {
      throw new NotFoundException('Google Calendar is not connected');
    }

    await this.prisma.googleCalendarIntegration.update({
      where: { userId },
      data: { status: 'SYNCING' },
    });

    try {
      const client = this.buildAuthorizedClient(record);
      const calendar = google.calendar({ version: 'v3', auth: client });
      const calendarId = record.googleCalendarId ?? 'primary';

      await this.pushLocalEvents(userId, calendar, calendarId);
      const nextSyncToken = await this.pullRemoteEvents(
        userId,
        calendar,
        calendarId,
        record.syncToken,
      );

      await this.prisma.googleCalendarIntegration.update({
        where: { userId },
        data: {
          status: 'CONNECTED',
          lastSyncedAt: new Date(),
          syncError: null,
          syncToken: nextSyncToken,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown sync error';
      this.logger.error(
        `Google Calendar sync failed for user ${userId}: ${message}`,
      );
      await this.prisma.googleCalendarIntegration.update({
        where: { userId },
        data: { status: 'ERROR', syncError: message.slice(0, 500) },
      });
      throw err;
    }

    return this.getStatus(userId);
  }

  // ─── Disconnect ─────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    const record = await this.prisma.googleCalendarIntegration.findUnique({
      where: { userId },
    });
    if (!record) return;

    if (record.refreshTokenEnc) {
      try {
        const client = this.createOAuthClient(this.webCallbackUrl());
        client.setCredentials({
          refresh_token: decryptToken(
            record.refreshTokenEnc,
            this.encryptionKey(),
          ),
        });
        await client.revokeCredentials();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(
          `Failed to revoke Google tokens for user ${userId}: ${message}`,
        );
      }
    }

    await this.prisma.googleCalendarIntegration.delete({ where: { userId } });
  }

  // ─── Sync helpers ───────────────────────────────────────────────

  private async pushLocalEvents(
    userId: string,
    calendar: calendar_v3.Calendar,
    calendarId: string,
  ): Promise<void> {
    const localEvents = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        externalId: null,
        source: { in: ['MANUAL', 'AI_SCHEDULED'] },
      },
    });

    for (const event of localEvents) {
      const { data } = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: event.title,
          description: event.description ?? undefined,
          start: event.isAllDay
            ? { date: toDateOnly(event.startTime) }
            : { dateTime: event.startTime.toISOString() },
          end: event.isAllDay
            ? { date: toDateOnly(event.endTime) }
            : { dateTime: event.endTime.toISOString() },
        },
      });

      if (data.id) {
        await this.prisma.calendarEvent.update({
          where: { id: event.id },
          data: { externalId: data.id },
        });
      }
    }
  }

  private async pullRemoteEvents(
    userId: string,
    calendar: calendar_v3.Calendar,
    calendarId: string,
    syncToken: string | null,
  ): Promise<string | undefined> {
    const remoteEvents: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let effectiveSyncToken = syncToken ?? undefined;

    do {
      let data: calendar_v3.Schema$Events;
      try {
        ({ data } = await calendar.events.list({
          calendarId,
          singleEvents: true,
          pageToken,
          syncToken: effectiveSyncToken,
          timeMin: effectiveSyncToken ? undefined : new Date().toISOString(),
        }));
      } catch (err) {
        // 410 GONE — sync token expired, fall back to a full resync
        if (this.isGoneError(err) && effectiveSyncToken) {
          effectiveSyncToken = undefined;
          pageToken = undefined;
          continue;
        }
        throw err;
      }

      remoteEvents.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? undefined;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    for (const remote of remoteEvents) {
      await this.upsertRemoteEvent(userId, remote);
    }

    return nextSyncToken;
  }

  private async upsertRemoteEvent(
    userId: string,
    remote: calendar_v3.Schema$Event,
  ): Promise<void> {
    if (!remote.id) return;

    if (remote.status === 'cancelled') {
      await this.prisma.calendarEvent.deleteMany({
        where: { userId, externalId: remote.id },
      });
      return;
    }

    const start = remote.start?.dateTime ?? remote.start?.date;
    const end = remote.end?.dateTime ?? remote.end?.date;
    if (!start || !end) return;

    const isAllDay = !!remote.start?.date;

    await this.prisma.calendarEvent.upsert({
      where: { userId_externalId: { userId, externalId: remote.id } },
      create: {
        userId,
        title: remote.summary ?? '(untitled)',
        description: remote.description,
        startTime: new Date(start),
        endTime: new Date(end),
        isAllDay,
        source: 'GOOGLE_CALENDAR',
        externalId: remote.id,
      },
      update: {
        title: remote.summary ?? '(untitled)',
        description: remote.description,
        startTime: new Date(start),
        endTime: new Date(end),
        isAllDay,
      },
    });
  }

  private isGoneError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: number }).code === 410
    );
  }

  // ─── Token persistence & refresh ──────────────────────────────────

  private async persistTokensAndActivate(
    userId: string,
    client: Auth.OAuth2Client,
    tokens: Auth.Credentials,
  ): Promise<GoogleCalendarIntegrationView> {
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: client, version: 'v2' });
    const { data: userinfo } = await oauth2.userinfo.get();

    const data: Prisma.GoogleCalendarIntegrationUpsertArgs['create'] = {
      userId,
      status: 'CONNECTED',
      googleEmail: userinfo.email ?? undefined,
      accessTokenEnc: tokens.access_token
        ? encryptToken(tokens.access_token, this.encryptionKey())
        : undefined,
      refreshTokenEnc: tokens.refresh_token
        ? encryptToken(tokens.refresh_token, this.encryptionKey())
        : undefined,
      tokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : undefined,
      googleCalendarId: 'primary',
    };

    await this.prisma.googleCalendarIntegration.upsert({
      where: { userId },
      create: data,
      update: { ...data, syncError: null },
    });

    return this.getStatus(userId);
  }

  private buildAuthorizedClient(
    record: GoogleCalendarIntegration,
  ): Auth.OAuth2Client {
    const client = this.createOAuthClient(this.webCallbackUrl());
    client.setCredentials({
      access_token: record.accessTokenEnc
        ? decryptToken(record.accessTokenEnc, this.encryptionKey())
        : undefined,
      refresh_token: record.refreshTokenEnc
        ? decryptToken(record.refreshTokenEnc, this.encryptionKey())
        : undefined,
      expiry_date: record.tokenExpiresAt?.getTime(),
    });

    // googleapis automatically refreshes the access token using the refresh
    // token when it's expired; persist the refreshed credentials so future
    // syncs don't need to re-authenticate.
    client.on('tokens', (tokens) => {
      void this.persistRefreshedTokens(record.userId, tokens);
    });

    return client;
  }

  private async persistRefreshedTokens(
    userId: string,
    tokens: Auth.Credentials,
  ): Promise<void> {
    const data: Prisma.GoogleCalendarIntegrationUpdateInput = {};
    if (tokens.access_token) {
      data.accessTokenEnc = encryptToken(
        tokens.access_token,
        this.encryptionKey(),
      );
    }
    if (tokens.refresh_token) {
      data.refreshTokenEnc = encryptToken(
        tokens.refresh_token,
        this.encryptionKey(),
      );
    }
    if (tokens.expiry_date) {
      data.tokenExpiresAt = new Date(tokens.expiry_date);
    }
    if (Object.keys(data).length === 0) return;

    await this.prisma.googleCalendarIntegration
      .update({ where: { userId }, data })
      .catch((err) => {
        this.logger.warn(
          `Failed to persist refreshed Google tokens: ${err.message}`,
        );
      });
  }

  // ─── Small helpers ────────────────────────────────────────────────

  private createOAuthClient(redirectUri: string): Auth.OAuth2Client {
    return new google.auth.OAuth2(
      this.config.getOrThrow('GOOGLE_CLIENT_ID'),
      this.config.getOrThrow('GOOGLE_CLIENT_SECRET'),
      redirectUri,
    );
  }

  private webCallbackUrl(): string {
    return this.config.getOrThrow('GOOGLE_OAUTH_CALLBACK_URL');
  }

  private encryptionKey(): string {
    return this.config.getOrThrow('GOOGLE_TOKEN_ENCRYPTION_KEY');
  }

  private toView(
    record: GoogleCalendarIntegration | null,
  ): GoogleCalendarIntegrationView {
    if (!record) {
      return { connected: false, status: 'NOT_CONNECTED' };
    }

    return {
      connected: record.status === 'CONNECTED' || record.status === 'SYNCING',
      status: record.status,
      googleEmail: record.googleEmail ?? undefined,
      lastSyncedAt: record.lastSyncedAt?.toISOString(),
      syncError: record.syncError ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
