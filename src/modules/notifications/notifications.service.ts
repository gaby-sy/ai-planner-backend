import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType, TaskStatus } from '@prisma/client';
import { addMinutes, format } from 'date-fns';

export const NOTIFICATIONS_QUEUE = 'notifications';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
  ) {}

  // ─── Get user notifications ───────────────────────────────────

  async getNotifications(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  // ─── Create a notification ────────────────────────────────────

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    options?: { taskId?: string; scheduledFor?: Date; metadata?: object },
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        taskId: options?.taskId,
        scheduledFor: options?.scheduledFor,
        metadata: options?.metadata,
      },
    });
  }

  // ─── Cron: Task reminders (every 15 minutes) ──────────────────

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendUpcomingTaskReminders() {
    const in30 = addMinutes(new Date(), 30);
    const in15 = addMinutes(new Date(), 15);

    const upcoming = await this.prisma.task.findMany({
      where: {
        status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        scheduledStart: { gte: in15, lte: in30 },
      },
      include: { user: true },
    });

    for (const task of upcoming) {
      await this.notificationsQueue.add('task-reminder', {
        userId: task.userId,
        taskId: task.id,
        title: `Reminder: "${task.title}"`,
        body: `Starting in ~15 minutes at ${format(task.scheduledStart!, 'HH:mm')}`,
      });
    }

    this.logger.log(`Queued ${upcoming.length} upcoming task reminders`);
  }

  // ─── Cron: Overdue alerts (every hour) ───────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async sendOverdueAlerts() {
    const overdue = await this.prisma.task.findMany({
      where: {
        status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        dueDate: { lt: new Date() },
      },
    });

    for (const task of overdue) {
      await this.notificationsQueue.add('task-overdue', {
        userId: task.userId,
        taskId: task.id,
        title: `Overdue: "${task.title}"`,
        body: `This task was due ${format(task.dueDate!, 'MMM dd')}. Time to tackle it or reschedule.`,
      });
    }

    this.logger.log(`Queued ${overdue.length} overdue alerts`);
  }

  // ─── Cron: Daily agenda (8:00 AM every day) ──────────────────

  @Cron('0 8 * * *')
  async sendDailyAgenda() {
    const users = await this.prisma.user.findMany();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    for (const user of users) {
      const todaysTasks = await this.prisma.task.findMany({
        where: {
          userId: user.id,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          OR: [
            { scheduledStart: { gte: startOfDay, lte: endOfDay } },
            { dueDate: { gte: startOfDay, lte: endOfDay } },
          ],
        },
        orderBy: [{ scheduledStart: 'asc' }, { priority: 'desc' }],
      });

      if (todaysTasks.length === 0) continue;

      const taskSummary = todaysTasks
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join('\n');

      await this.notificationsQueue.add('daily-agenda', {
        userId: user.id,
        title: `Good morning! You have ${todaysTasks.length} task${todaysTasks.length > 1 ? 's' : ''} today`,
        body: taskSummary,
      });
    }
  }
}
