import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register ────────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: passwordHash,
        timezone: dto.timezone ?? 'UTC',
      },
    });

    this.logger.log(`New user registered: ${user.id}`);
    return this.issueTokens(user, userAgent, ipAddress);
  }

  // ─── Login ────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    this.logger.log(`User logged in: ${user.id}`);
    return this.issueTokens(user, userAgent, ipAddress);
  }

  // ─── Refresh ──────────────────────────────────────────────────

  async refresh(
    userId: string,
    oldRefreshTokenId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Token rotation — revoke the used token
    await this.prisma.refreshToken.update({
      where: { id: oldRefreshTokenId },
      data: { isRevoked: true },
    });

    return this.issueTokens(user, userAgent, ipAddress);
  }

  // ─── Logout ───────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    // Revoke all tokens for this user (full logout from all devices)
    await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  // ─── Validate refresh token ───────────────────────────────────

  async validateRefreshToken(userId: string, rawToken: string) {
    const hash = this.hashToken(rawToken);
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
    });

    if (
      !tokenRecord ||
      tokenRecord.userId !== userId ||
      tokenRecord.isRevoked ||
      tokenRecord.expiresAt < new Date()
    ) {
      return null;
    }

    return tokenRecord;
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async issueTokens(
    user: User,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const rawRefresh = crypto.randomBytes(64).toString('hex');
    const refreshHash = this.hashToken(rawRefresh);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    const { password: _pw, ...safeUser } = user;

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: 15 * 60, // 15 minutes in seconds
      user: safeUser,
    };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}