import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';

// Core
import { PrismaModule } from './prisma/prisma.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { AiModule } from './modules/ai/ai.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    // ─── Configuration (global) ───────────────────────────────
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // ─── Rate limiting ────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 second
        limit: 10,   // 10 requests per second
      },
      {
        name: 'long',
        ttl: 60000,  // 1 minute
        limit: 100,  // 100 requests per minute
      },
    ]),

    // ─── Bull Queue (Redis) ───────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),

    // ─── Database (global via PrismaModule's @Global()) ──────
    PrismaModule,

    // ─── Feature modules ─────────────────────────────────────
    AuthModule,
    UsersModule,
    TasksModule,
    CalendarModule,
    AiModule,
    SchedulingModule,
    NotificationsModule,
    WebsocketModule,
  ],
})
export class AppModule {}