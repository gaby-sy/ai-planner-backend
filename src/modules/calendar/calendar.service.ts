import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { CalendarEvent, Availability } from '@prisma/client';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Events ───────────────────────────────────────────────────

  async createEvent(userId: string, dto: CreateEventDto): Promise<CalendarEvent> {
    return this.prisma.calendarEvent.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        isAllDay: dto.isAllDay ?? false,
        color: dto.color,
        isRecurring: !!dto.recurrenceRule,
        recurrenceRule: dto.recurrenceRule,
      },
    });
  }

  async getEvents(
    userId: string,
    from: string,
    to: string,
  ): Promise<CalendarEvent[]> {
    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: new Date(from) },
        endTime: { lte: new Date(to) },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getEvent(id: string, userId: string): Promise<CalendarEvent> {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    if (event.userId !== userId) throw new ForbiddenException();
    return event;
  }

  async updateEvent(
    id: string,
    userId: string,
    dto: UpdateEventDto,
  ): Promise<CalendarEvent> {
    await this.getEvent(id, userId);
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...dto,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        isRecurring: dto.recurrenceRule !== undefined ? !!dto.recurrenceRule : undefined,
      },
    });
  }

  async deleteEvent(id: string, userId: string): Promise<void> {
    await this.getEvent(id, userId);
    await this.prisma.calendarEvent.delete({ where: { id } });
  }

  // ─── Busy slots ───────────────────────────────────────────────

  async getBusySlots(
    userId: string,
    from: string,
    to: string,
  ): Promise<Array<{ start: Date; end: Date }>> {
    const events = await this.getEvents(userId, from, to);
    return events.map((e) => ({ start: e.startTime, end: e.endTime }));
  }

  // ─── Availability templates ───────────────────────────────────

  async setAvailability(
    userId: string,
    dto: SetAvailabilityDto,
  ): Promise<Availability> {
    return this.prisma.availability.upsert({
      where: {
        // compound unique via prisma @@unique not set — use findFirst pattern
        id: (await this.findAvailabilityRecord(userId, dto.dayOfWeek))?.id ?? '',
      },
      update: {
        startTime: dto.startTime,
        endTime: dto.endTime,
        type: dto.type,
        label: dto.label,
      },
      create: {
        userId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        type: dto.type,
        label: dto.label,
      },
    });
  }

  async getAvailability(userId: string): Promise<Availability[]> {
    return this.prisma.availability.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async deleteAvailability(id: string, userId: string): Promise<void> {
    const record = await this.prisma.availability.findUnique({ where: { id } });
    if (!record) throw new NotFoundException();
    if (record.userId !== userId) throw new ForbiddenException();
    await this.prisma.availability.delete({ where: { id } });
  }

  private async findAvailabilityRecord(userId: string, dayOfWeek: number) {
    return this.prisma.availability.findFirst({
      where: { userId, dayOfWeek },
    });
  }
}