import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleCalendarService } from './google-calendar.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarPlatform } from './dto/google-auth-url-query.dto';
import { encryptToken } from './utils/token-encryption.util';

const ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte key, hex-encoded

const mockOAuthClient = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  revokeCredentials: jest.fn(),
  on: jest.fn(),
};

const mockCalendarEvents = {
  insert: jest.fn(),
  list: jest.fn(),
};

const mockUserinfoGet = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => mockOAuthClient) },
    oauth2: jest.fn(() => ({ userinfo: { get: mockUserinfoGet } })),
    calendar: jest.fn(() => ({ events: mockCalendarEvents })),
  },
}));

const mockPrisma = {
  googleCalendarIntegration: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  calendarEvent: {
    findMany: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed-state'),
  verify: jest.fn(),
};

const configValues: Record<string, string> = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_OAUTH_CALLBACK_URL:
    'https://api.example.com/api/v1/integrations/google-calendar/callback',
  GOOGLE_OAUTH_STATE_SECRET: 'state-secret',
  GOOGLE_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => configValues[key]),
};

const userId = 'user-uuid-1';

const mockRecord = {
  id: 'integration-1',
  userId,
  status: 'CONNECTED' as const,
  googleEmail: 'user@example.com',
  accessTokenEnc: encryptToken('access-token', ENCRYPTION_KEY),
  refreshTokenEnc: encryptToken('refresh-token', ENCRYPTION_KEY),
  tokenExpiresAt: new Date(),
  googleCalendarId: 'primary',
  syncToken: null,
  lastSyncedAt: null,
  syncError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<GoogleCalendarService>(GoogleCalendarService);
    jest.clearAllMocks();
  });

  // ─── getStatus ────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return NOT_CONNECTED when no integration exists', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(null);

      const result = await service.getStatus(userId);

      expect(result).toEqual({ connected: false, status: 'NOT_CONNECTED' });
    });

    it('should map a connected record to the view shape without tokens', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(
        mockRecord,
      );

      const result = await service.getStatus(userId);

      expect(result.connected).toBe(true);
      expect(result.status).toBe('CONNECTED');
      expect(result.googleEmail).toBe('user@example.com');
      expect(result).not.toHaveProperty('accessTokenEnc');
      expect(result).not.toHaveProperty('refreshTokenEnc');
    });
  });

  // ─── getAuthUrl ───────────────────────────────────────────────

  describe('getAuthUrl', () => {
    it('should build a consent URL using the backend callback for web', async () => {
      mockOAuthClient.generateAuthUrl.mockReturnValue(
        'https://accounts.google.com/o/oauth2/auth',
      );

      const result = await service.getAuthUrl(
        userId,
        undefined,
        GoogleCalendarPlatform.WEB,
      );

      expect(result).toEqual({
        url: 'https://accounts.google.com/o/oauth2/auth',
      });
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'client-id',
        'client-secret',
        configValues.GOOGLE_OAUTH_CALLBACK_URL,
      );
      expect(mockOAuthClient.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'signed-state',
          access_type: 'offline',
        }),
      );
    });

    it('should use the caller-supplied redirectUri for mobile', async () => {
      mockOAuthClient.generateAuthUrl.mockReturnValue(
        'https://accounts.google.com/o/oauth2/auth',
      );

      await service.getAuthUrl(
        userId,
        'com.aiplanner.mobile://oauth/callback',
        GoogleCalendarPlatform.MOBILE,
      );

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'client-id',
        'client-secret',
        'com.aiplanner.mobile://oauth/callback',
      );
    });

    it('should throw BadRequestException for mobile without a redirectUri', async () => {
      await expect(
        service.getAuthUrl(userId, undefined, GoogleCalendarPlatform.MOBILE),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── connect ──────────────────────────────────────────────────

  describe('connect', () => {
    it('should exchange the code, store tokens, and return the status', async () => {
      mockOAuthClient.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at',
          refresh_token: 'rt',
          expiry_date: Date.now() + 3600_000,
        },
      });
      mockUserinfoGet.mockResolvedValue({
        data: { email: 'user@example.com' },
      });
      mockPrisma.googleCalendarIntegration.upsert.mockResolvedValue(mockRecord);
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(
        mockRecord,
      );

      const result = await service.connect(
        userId,
        'auth-code',
        'com.aiplanner.mobile://oauth/callback',
      );

      expect(mockOAuthClient.getToken).toHaveBeenCalledWith('auth-code');
      expect(mockPrisma.googleCalendarIntegration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          create: expect.objectContaining({ userId, status: 'CONNECTED' }),
        }),
      );
      expect(result.connected).toBe(true);
    });
  });

  // ─── sync ─────────────────────────────────────────────────────

  describe('sync', () => {
    it('should throw NotFoundException when not connected', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(null);

      await expect(service.sync(userId)).rejects.toThrow(NotFoundException);
    });

    it('should push local events, pull remote events, and mark CONNECTED', async () => {
      mockPrisma.googleCalendarIntegration.findUnique
        .mockResolvedValueOnce(mockRecord) // initial lookup
        .mockResolvedValueOnce({
          ...mockRecord,
          lastSyncedAt: new Date(),
          syncToken: 'next-token',
        }); // final getStatus
      mockPrisma.googleCalendarIntegration.update.mockResolvedValue(mockRecord);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
      mockCalendarEvents.list.mockResolvedValue({
        data: {
          items: [
            {
              id: 'g-event-1',
              status: 'confirmed',
              summary: 'Synced Event',
              start: { dateTime: '2026-01-01T10:00:00.000Z' },
              end: { dateTime: '2026-01-01T11:00:00.000Z' },
            },
          ],
          nextSyncToken: 'next-token',
        },
      });
      mockPrisma.calendarEvent.upsert.mockResolvedValue({});

      const result = await service.sync(userId);

      expect(mockPrisma.calendarEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_externalId: { userId, externalId: 'g-event-1' } },
        }),
      );
      expect(mockPrisma.googleCalendarIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          data: expect.objectContaining({
            status: 'CONNECTED',
            syncToken: 'next-token',
          }),
        }),
      );
      expect(result.status).toBe('CONNECTED');
    });

    it('should mark ERROR and rethrow when the Google API call fails', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(
        mockRecord,
      );
      mockPrisma.googleCalendarIntegration.update.mockResolvedValue(mockRecord);
      mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
      mockCalendarEvents.list.mockRejectedValue(new Error('Google API down'));

      await expect(service.sync(userId)).rejects.toThrow('Google API down');

      expect(mockPrisma.googleCalendarIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ERROR' }),
        }),
      );
    });
  });

  // ─── disconnect ───────────────────────────────────────────────

  describe('disconnect', () => {
    it('should do nothing when no integration exists', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(null);

      await service.disconnect(userId);

      expect(
        mockPrisma.googleCalendarIntegration.delete,
      ).not.toHaveBeenCalled();
    });

    it('should revoke tokens and delete the integration', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(
        mockRecord,
      );
      mockOAuthClient.revokeCredentials.mockResolvedValue(undefined);

      await service.disconnect(userId);

      expect(mockOAuthClient.revokeCredentials).toHaveBeenCalled();
      expect(mockPrisma.googleCalendarIntegration.delete).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should still delete the integration if token revocation fails', async () => {
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(
        mockRecord,
      );
      mockOAuthClient.revokeCredentials.mockRejectedValue(
        new Error('revoke failed'),
      );

      await service.disconnect(userId);

      expect(mockPrisma.googleCalendarIntegration.delete).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  // ─── handleWebCallback ────────────────────────────────────────

  describe('handleWebCallback', () => {
    it('should verify state and store tokens for the encoded user', async () => {
      mockJwt.verify.mockReturnValue({ sub: userId });
      mockOAuthClient.getToken.mockResolvedValue({
        tokens: {
          access_token: 'at',
          refresh_token: 'rt',
          expiry_date: Date.now() + 3600_000,
        },
      });
      mockUserinfoGet.mockResolvedValue({
        data: { email: 'user@example.com' },
      });
      mockPrisma.googleCalendarIntegration.upsert.mockResolvedValue(mockRecord);
      mockPrisma.googleCalendarIntegration.findUnique.mockResolvedValue(
        mockRecord,
      );

      await service.handleWebCallback('auth-code', 'signed-state');

      expect(mockJwt.verify).toHaveBeenCalledWith(
        'signed-state',
        expect.any(Object),
      );
      expect(mockPrisma.googleCalendarIntegration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });
  });
});
