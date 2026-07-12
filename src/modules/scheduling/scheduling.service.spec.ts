import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingService } from './scheduling.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TaskStatus, TaskPriority, TaskSource } from '@prisma/client';
import { addDays } from 'date-fns';

const userId = 'user-uuid-1';
const taskId = 'task-uuid-1';

const mockUser = {
  id: userId,
  email: 'test@example.com',
  name: 'Test User',
  password: 'hashed',
  timezone: 'UTC',
  workStartTime: '09:00',
  workEndTime: '17:00',
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
  bufferBetweenTasks: 15,
  preferredFocusStart: '09:00',
  preferredFocusEnd: '12:00',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
  dueDate: addDays(new Date(), 5),
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
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUniqueOrThrow: jest.fn(),
  },
  calendarEvent: {
    create: jest.fn(),
  },
};

const mockCalendarService = {
  getBusySlots: jest.fn().mockResolvedValue([]),
};

describe('SchedulingService', () => {
  let service: SchedulingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CalendarService, useValue: mockCalendarService },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    jest.clearAllMocks();
  });

  describe('scheduleTask', () => {
    it('should throw NotFoundException for a nonexistent task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.scheduleTask(userId, { taskId: 'no-id' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when task has no estimatedDuration', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...mockTask,
        estimatedDuration: null,
      });
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      await expect(
        service.scheduleTask(userId, { taskId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return suggestions when slots are available', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);
      mockCalendarService.getBusySlots.mockResolvedValue([]);

      const result = await service.scheduleTask(userId, { taskId });

      expect(result.task.id).toBe(taskId);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.bestSlot).toBeDefined();
      expect(result.bestSlot.start).toBeInstanceOf(Date);
      expect(result.bestSlot.end).toBeInstanceOf(Date);
    });

    it('should avoid busy calendar slots', async () => {
      const tomorrow = addDays(new Date(), 1);
      tomorrow.setHours(0, 0, 0, 0);
      const busyStart = new Date(tomorrow);
      busyStart.setHours(9, 0, 0, 0);
      const busyEnd = new Date(tomorrow);
      busyEnd.setHours(17, 0, 0, 0); // All day busy

      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);
      mockCalendarService.getBusySlots.mockResolvedValue([
        { start: busyStart, end: busyEnd },
      ]);

      const result = await service.scheduleTask(userId, { taskId });

      // Suggestions should not overlap with the busy block
      for (const slot of result.suggestions) {
        const overlapsBusy =
          slot.start < busyEnd && slot.end > busyStart;
        expect(overlapsBusy).toBe(false);
      }
    });
  });
});
