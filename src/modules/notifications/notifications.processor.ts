import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { NOTIFICATIONS_QUEUE } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { EventsGateway } from '../websocket/events.gateway';

interface NotificationJob {
  userId: string;
  taskId?: string;
  title: string;
  body: string;
  metadata?: object;
}

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  @Process('task-reminder')
  async handleTaskReminder(job: Job<NotificationJob>) {
    await this.persistAndPush(job.data, NotificationType.TASK_REMINDER);
  }

  @Process('task-overdue')
  async handleTaskOverdue(job: Job<NotificationJob>) {
    await this.persistAndPush(job.data, NotificationType.TASK_OVERDUE);
  }

  @Process('daily-agenda')
  async handleDailyAgenda(job: Job<NotificationJob>) {
    await this.persistAndPush(job.data, NotificationType.DAILY_AGENDA);
  }

  @Process('scheduling-suggestion')
  async handleSchedulingSuggestion(job: Job<NotificationJob>) {
    await this.persistAndPush(job.data, NotificationType.SCHEDULING_SUGGESTION);
  }

  private async persistAndPush(data: NotificationJob, type: NotificationType) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type,
          title: data.title,
          body: data.body,
          taskId: data.taskId,
          sentAt: new Date(),
          metadata: data.metadata,
        },
      });

      // Push via WebSocket
      this.events.sendToUser(data.userId, 'notification', notification);
      this.logger.log(`[${type}] sent to user ${data.userId}: "${data.title}"`);
    } catch (error) {
      this.logger.error(`Failed to process ${type} notification`, error);
      throw error; // Bull will retry
    }
  }
}