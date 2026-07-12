import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskStatus } from '@prisma/client';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: string;
  tags?: string[];
  dueBefore?: string;
  dueAfter?: string;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────

  async create(userId: string, dto: CreateTaskDto): Promise<Task> {
    return this.prisma.task.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        estimatedDuration: dto.estimatedDuration,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        tags: dto.tags ?? [],
        businessHoursStart: dto.businessHoursStart,
        businessHoursEnd: dto.businessHoursEnd,
      },
    });
  }

  // ─── List ─────────────────────────────────────────────────────

  async findAll(userId: string, filters: TaskFilters = {}): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        userId,
        ...(filters.status && { status: filters.status }),
        ...(filters.priority && { priority: filters.priority as any }),
        ...(filters.tags?.length && { tags: { hasSome: filters.tags } }),
        ...(filters.dueBefore && {
          dueDate: { lte: new Date(filters.dueBefore) },
        }),
        ...(filters.dueAfter && {
          dueDate: { gte: new Date(filters.dueAfter) },
        }),
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // ─── Get One ──────────────────────────────────────────────────

  async findOne(id: string, userId: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    if (task.userId !== userId) throw new ForbiddenException();
    return task;
  }

  // ─── Update ───────────────────────────────────────────────────

  async update(id: string, userId: string, dto: UpdateTaskDto): Promise<Task> {
    await this.findOne(id, userId); // ownership check
    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  // ─── Complete ─────────────────────────────────────────────────

  async complete(id: string, userId: string): Promise<Task> {
    await this.findOne(id, userId);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.DONE, completedAt: new Date() },
    });
  }

  // ─── Delete ───────────────────────────────────────────────────

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);
    await this.prisma.task.delete({ where: { id } });
  }

  // ─── Today's tasks ────────────────────────────────────────────

  async getTodaysTasks(userId: string): Promise<Task[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.task.findMany({
      where: {
        userId,
        status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        OR: [
          { scheduledStart: { gte: startOfDay, lte: endOfDay } },
          { dueDate: { lte: endOfDay } },
        ],
      },
      orderBy: [{ scheduledStart: 'asc' }, { priority: 'desc' }],
    });
  }

  // ─── Overdue ──────────────────────────────────────────────────

  async getOverdue(userId: string): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        userId,
        status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: 'asc' },
    });
  }
}