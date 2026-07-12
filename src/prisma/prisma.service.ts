import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  /** Soft-delete helper — not used by Prisma natively but useful for utilities */
  excludeField<T, K extends keyof T>(entity: T, keys: K[]): Omit<T, K> {
    return Object.fromEntries(
      Object.entries(entity as Record<string, unknown>).filter(
        ([key]) => !keys.includes(key as K),
      ),
    ) as Omit<T, K>;
  }
}