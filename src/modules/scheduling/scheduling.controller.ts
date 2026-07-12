import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SchedulingService } from './scheduling.service';
import { ScheduleTaskDto } from './dto/schedule-task.dto';

class ConfirmSlotDto {
  start: string;
  end: string;
}

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post('suggest')
  @ApiOperation({
    summary: 'Get time slot suggestions for a task',
    description:
      'The AI scheduling engine reads your calendar and availability to suggest the best time slots. Returns top 3 options.',
  })
  suggest(@CurrentUser() user: User, @Body() dto: ScheduleTaskDto) {
    return this.schedulingService.scheduleTask(user.id, dto);
  }

  @Post('confirm/:taskId')
  @ApiOperation({
    summary: 'Confirm a scheduling slot and block it on the calendar',
  })
  confirm(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: User,
    @Body() body: ConfirmSlotDto,
  ) {
    return this.schedulingService.confirmSchedule(user.id, taskId, body);
  }
}