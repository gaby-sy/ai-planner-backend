import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  password: 'hashed-password',
  name: 'Test User',
  timezone: 'UTC',
  workStartTime: '09:00',
  workEndTime: '17:00',
  workDays: [1, 2, 3, 4, 5],
  bufferBetweenTasks: 15,
  preferredFocusStart: null,
  preferredFocusEnd: null,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('secret-key'),
  get: jest.fn().mockReturnValue('http://localhost:4200'),
};

const mockEmailService = {
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ─── Register ─────────────────────────────────────────────────

  describe('register', () => {
    it('should create a user and return tokens', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.register({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should throw ConflictException when email already registered', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          name: 'Test',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Login ────────────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({ id: 'rt-1' });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'no@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke all refresh tokens', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.logout('user-uuid-1');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });
  });

  // ─── Request password reset ────────────────────────────────────

  describe('requestPasswordReset', () => {
    it('should create a reset token and send an email when the user exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

      await service.requestPasswordReset({ email: 'test@example.com' });

      expect(mockPrismaService.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: mockUser.id }),
        }),
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        expect.stringContaining('/auth/reset-password?token='),
      );
    });

    // Regression guard: this endpoint must not reveal whether an email is
    // registered, otherwise it becomes a user-enumeration oracle. It should
    // resolve successfully either way, without creating a token or emailing.
    it('should resolve without creating a token or sending an email when the user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset({ email: 'unknown@example.com' }),
      ).resolves.toBeUndefined();

      expect(mockPrismaService.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // ─── Reset password ─────────────────────────────────────────────

  describe('resetPassword', () => {
    const validTokenRecord = {
      id: 'prt-1',
      userId: 'user-uuid-1',
      tokenHash: 'hashed-token',
      isUsed: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    it('should update the password, mark the token used, and revoke sessions', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue(validTokenRecord);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.passwordResetToken.update.mockResolvedValue({
        ...validTokenRecord,
        isUsed: true,
      });
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.resetPassword({ token: 'raw-token', password: 'newPassword123' });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: validTokenRecord.userId },
        data: { password: expect.any(String) },
      });
      expect(mockPrismaService.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: validTokenRecord.id },
        data: { isUsed: true },
      });
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: validTokenRecord.userId, isRevoked: false },
        data: { isRevoked: true },
      });
    });

    it('should throw BadRequestException when the token does not exist', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'bad-token', password: 'newPassword123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the token was already used', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue({
        ...validTokenRecord,
        isUsed: true,
      });

      await expect(
        service.resetPassword({ token: 'raw-token', password: 'newPassword123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the token has expired', async () => {
      mockPrismaService.passwordResetToken.findUnique.mockResolvedValue({
        ...validTokenRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword({ token: 'raw-token', password: 'newPassword123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});