import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('EmailService', () => {
  let configValues: Record<string, string | undefined>;

  const buildService = async (): Promise<EmailService> => {
    const mockConfigService = {
      get: jest.fn((key: string) => configValues[key]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configValues = {};
  });

  describe('when RESEND_API_KEY is not configured', () => {
    it('logs the email instead of sending it', async () => {
      configValues = { RESEND_API_KEY: undefined };
      const service = await buildService();
      const logSpy = jest.spyOn((service as any).logger, 'log');

      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset?token=abc123',
      );

      expect(mockSend).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('user@example.com'),
      );
    });
  });

  describe('when RESEND_API_KEY is configured', () => {
    beforeEach(() => {
      configValues = {
        RESEND_API_KEY: 're_test_key',
        EMAIL_FROM: 'AI Planner <test@example.com>',
      };
    });

    it('sends the password reset email via Resend', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });
      const service = await buildService();

      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset?token=abc123',
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'AI Planner <test@example.com>',
          to: 'user@example.com',
          subject: expect.stringContaining('Reset'),
          html: expect.stringContaining(
            'https://app.example.com/reset?token=abc123',
          ),
        }),
      );
    });

    it('logs and does not throw when Resend returns an error', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' },
      });
      const service = await buildService();
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      await expect(
        service.sendPasswordResetEmail(
          'user@example.com',
          'https://app.example.com/reset?token=abc123',
        ),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid API key'),
      );
    });

    it('logs and does not throw when Resend throws', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));
      const service = await buildService();
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      await expect(
        service.sendPasswordResetEmail(
          'user@example.com',
          'https://app.example.com/reset?token=abc123',
        ),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
      );
    });
  });
});
