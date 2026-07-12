import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('secret-key'),
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
});