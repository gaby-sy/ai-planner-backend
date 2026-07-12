import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TaskStatus, TaskPriority, TaskSource } from '@prisma/client';

const userId = 'user-uuid-1';
const taskId = 'task-uuid-1';

const mockTask = {
  id: taskId,
  userId,
  title: 'Car Inspection',
  description: null,
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  estimatedDuration: 60,
  tags: [],
  source: TaskSource.MANUAL,
  dueDate: null,
  scheduledStart: null,
  scheduledEnd: null,
  completedAt: null,
  businessHoursStart: '08:00',
  businessHoursEnd: '17:00',
  calendarEventId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  task: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a task', async () => {
      mockPrisma.task.create.mockResolvedValue(mockTask);

      const result = await service.create(userId, {
        title: 'Car Inspection',
        estimatedDuration: 60,
        businessHoursStart: '08:00',
        businessHoursEnd: '17:00',
      });

      expect(result).toEqual(mockTask);
      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId, title: 'Car Inspection' }),
        }),
      );
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return tasks for a user', async () => {
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);
      const result = await service.findAll(userId);
      expect(result).toHaveLength(1);
    });

    it('should apply status filter', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      await service.findAll(userId, { status: TaskStatus.DONE });
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: TaskStatus.DONE }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a task owned by the user', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      const result = await service.findOne(taskId, userId);
      expect(result.id).toBe(taskId);
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(service.findOne('no-id', userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if task belongs to another user', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ ...mockTask, userId: 'other-user' });
      await expect(service.findOne(taskId, userId)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── complete ─────────────────────────────────────────────────

  describe('complete', () => {
    it('should mark task as DONE and set completedAt', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.task.update.mockResolvedValue({
        ...mockTask,
        status: TaskStatus.DONE,
        completedAt: new Date(),
      });

      const result = await service.complete(taskId, userId);
      expect(result.status).toBe(TaskStatus.DONE);
      expect(result.completedAt).toBeDefined();
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.task.delete.mockResolvedValue(mockTask);

      await expect(service.remove(taskId, userId)).resolves.toBeUndefined();
      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });
    });
  });
});