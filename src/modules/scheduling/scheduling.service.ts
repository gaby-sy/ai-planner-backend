import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { ScheduleTaskDto } from './dto/schedule-task.dto';
import { Task, User, CalendarEventSource } from '@prisma/client';
import {
  addMinutes,
  addDays,
  isAfter,
  isBefore,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
  getDay,
  differenceInMinutes,
} from 'date-fns';

export interface TimeSlot {
  start: Date;
  end: Date;
  score: number; // higher = better fit
}

export interface ScheduleResult {
  task: Task;
  suggestions: TimeSlot[];
  bestSlot: TimeSlot;
}

interface BusyBlock {
  start: Date;
  end: Date;
}

interface WorkWindow {
  start: Date;
  end: Date;
}

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
  ) {}

  // ─── Main entry point ─────────────────────────────────────────

  async scheduleTask(
    userId: string,
    dto: ScheduleTaskDto,
  ): Promise<ScheduleResult> {
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found`);
    if (task.userId !== userId) throw new BadRequestException('Task does not belong to user');
    if (!task.estimatedDuration) {
      throw new BadRequestException(
        'Task must have an estimatedDuration before scheduling',
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const windowStart = dto.windowStart ? parseISO(dto.windowStart) : new Date();
    const windowEnd = dto.windowEnd
      ? parseISO(dto.windowEnd)
      : task.dueDate ?? addDays(new Date(), 7);

    const busySlots = await this.calendarService.getBusySlots(
      userId,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );

    const candidates = this.generateCandidateSlots(
      user,
      task,
      windowStart,
      windowEnd,
      busySlots,
    );

    if (candidates.length === 0) {
      throw new BadRequestException(
        'No available time slots found in the requested window. Try expanding the date range.',
      );
    }

    const scored = this.scoreSlots(candidates, task, user);
    const top3 = scored.slice(0, 3);

    this.logger.log(
      `Found ${candidates.length} candidates, returning top ${top3.length} for task "${task.title}"`,
    );

    return { task, suggestions: top3, bestSlot: top3[0] };
  }

  // ─── Confirm scheduling ───────────────────────────────────────

  async confirmSchedule(
    userId: string,
    taskId: string,
    slot: { start: string; end: string },
  ): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.userId !== userId) throw new NotFoundException();

    const start = parseISO(slot.start);
    const end = parseISO(slot.end);

    // Create calendar event
    const event = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: task.title,
        description: `Scheduled task: ${task.description ?? ''}`,
        startTime: start,
        endTime: end,
        source: CalendarEventSource.AI_SCHEDULED,
        color: '#6366F1', // Indigo — AI-scheduled events
      },
    });

    // Update task with scheduled times and link to event
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        scheduledStart: start,
        scheduledEnd: end,
        calendarEventId: event.id,
      },
    });
  }

  // ─── Core algorithm ───────────────────────────────────────────

  /**
   * Scheduling Algorithm:
   * 1. Iterate each day in [windowStart, windowEnd]
   * 2. If the day is a work day for the user, generate working hour windows
   * 3. If the task has business hours constraints, intersect them with work hours
   * 4. Split each daily window into slots of (estimatedDuration + buffer)
   * 5. Discard slots that overlap with busy blocks
   * 6. Return all valid candidate slots
   */
  private generateCandidateSlots(
    user: User,
    task: Task,
    windowStart: Date,
    windowEnd: Date,
    busyBlocks: BusyBlock[],
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const duration = task.estimatedDuration!;

    let cursor = windowStart;

    while (isBefore(cursor, windowEnd)) {
      const dayOfWeek = getDay(cursor);

      if (user.workDays.includes(dayOfWeek)) {
        const windows = this.getDayWorkWindows(user, task, cursor);

        for (const win of windows) {
          let slotStart = isBefore(win.start, windowStart) ? windowStart : win.start;

          while (true) {
            const slotEnd = addMinutes(slotStart, duration);

            if (isAfter(slotEnd, win.end)) break;
            if (isAfter(slotEnd, windowEnd)) break;

            if (!this.overlapsWithBusy(slotStart, slotEnd, busyBlocks)) {
              slots.push({ start: slotStart, end: slotEnd, score: 0 });
            }

            // Advance by 30-minute increments
            slotStart = addMinutes(slotStart, 30);
          }
        }
      }

      cursor = addDays(startOfDay(cursor), 1);
    }

    return slots;
  }

  /**
   * Get work windows for a specific day, optionally intersecting
   * with task business hours constraints (e.g. "office open 8am-5pm")
   */
  private getDayWorkWindows(
    user: User,
    task: Task,
    day: Date,
  ): WorkWindow[] {
    const [workStartH, workStartM] = user.workStartTime.split(':').map(Number);
    const [workEndH, workEndM] = user.workEndTime.split(':').map(Number);

    let windowStart = setMinutes(setHours(startOfDay(day), workStartH), workStartM);
    let windowEnd = setMinutes(setHours(startOfDay(day), workEndH), workEndM);

    // Apply task-specific business hour constraints
    if (task.businessHoursStart) {
      const [bh, bm] = task.businessHoursStart.split(':').map(Number);
      const bizStart = setMinutes(setHours(startOfDay(day), bh), bm);
      if (isAfter(bizStart, windowStart)) windowStart = bizStart;
    }
    if (task.businessHoursEnd) {
      const [bh, bm] = task.businessHoursEnd.split(':').map(Number);
      const bizEnd = setMinutes(setHours(startOfDay(day), bh), bm);
      if (isBefore(bizEnd, windowEnd)) windowEnd = bizEnd;
    }

    if (isAfter(windowStart, windowEnd)) return [];
    return [{ start: windowStart, end: windowEnd }];
  }

  private overlapsWithBusy(start: Date, end: Date, busy: BusyBlock[]): boolean {
    return busy.some(
      (b) =>
        isBefore(start, b.end) && isAfter(end, b.start),
    );
  }

  // ─── Scoring ──────────────────────────────────────────────────

  /**
   * Slot Scoring (higher = more desirable):
   * +30  — falls in user's preferred focus window
   * +20  — early in the day (morning bias)
   * +10  — sooner = better (ADHD-friendly: act now)
   * -5   per day away from due date (deadline pressure)
   */
  private scoreSlots(slots: TimeSlot[], task: Task, user: User): TimeSlot[] {
    const now = new Date();

    return slots
      .map((slot) => {
        let score = 0;

        // Prefer focus window
        if (user.preferredFocusStart && user.preferredFocusEnd) {
          const [fsh, fsm] = user.preferredFocusStart.split(':').map(Number);
          const [feh, fem] = user.preferredFocusEnd.split(':').map(Number);
          const focusStart = setMinutes(setHours(startOfDay(slot.start), fsh), fsm);
          const focusEnd = setMinutes(setHours(startOfDay(slot.start), feh), fem);

          if (!isBefore(slot.start, focusStart) && !isAfter(slot.end, focusEnd)) {
            score += 30;
          }
        }

        // Morning bias (before noon gets +20, before 14:00 gets +10)
        const hour = slot.start.getHours();
        if (hour < 12) score += 20;
        else if (hour < 14) score += 10;

        // Sooner is better
        const daysFromNow = differenceInMinutes(slot.start, now) / (60 * 24);
        score += Math.max(0, 15 - daysFromNow); // up to +15

        // Due date pressure
        if (task.dueDate) {
          const daysBeforeDue = differenceInMinutes(task.dueDate, slot.start) / (60 * 24);
          if (daysBeforeDue < 1) score -= 5; // Very close to due = slight penalty
          else if (daysBeforeDue < 2) score += 5; // Day before = bonus
        }

        return { ...slot, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
