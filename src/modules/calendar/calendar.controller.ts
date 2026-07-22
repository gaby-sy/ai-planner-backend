import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // ─── Events ───────────────────────────────────────────────────

  @Post('events')
  @ApiOperation({ summary: 'Create a calendar event' })
  createEvent(@CurrentUser() user: User, @Body() dto: CreateEventDto) {
    return this.calendarService.createEvent(user.id, dto);
  }

  @Get('events')
  @ApiOperation({ summary: 'List events in a date range' })
  @ApiQuery({ name: 'from', required: true, type: String, example: '2026-06-23T00:00:00.000Z' })
  @ApiQuery({ name: 'to', required: true, type: String, example: '2026-06-30T23:59:59.000Z' })
  getEvents(
    @CurrentUser() user: User,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.calendarService.getEvents(user.id, from, to);
  }
  @Get('events/busy')
  @ApiOperation({ summary: 'Get busy time slots in a range (for scheduling)' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  getBusySlots(
    @CurrentUser() user: User,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.calendarService.getBusySlots(user.id, from, to);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get a single event' })
  getEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.calendarService.getEvent(id, user.id);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update a calendar event' })
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateEventDto,
  ) {
    return this.calendarService.updateEvent(id, user.id, dto);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a calendar event' })
  deleteEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.calendarService.deleteEvent(id, user.id);
  }

  // ─── Availability ─────────────────────────────────────────────

  @Post('availability')
  @ApiOperation({ summary: 'Set availability for a day of week' })
  setAvailability(
    @CurrentUser() user: User,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.calendarService.setAvailability(user.id, dto);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Get all availability templates' })
  getAvailability(@CurrentUser() user: User) {
    return this.calendarService.getAvailability(user.id);
  }

  @Delete('availability/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an availability block' })
  deleteAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.calendarService.deleteAvailability(id, user.id);
  }
}
