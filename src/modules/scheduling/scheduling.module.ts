import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [CalendarModule],
  providers: [SchedulingService],
  controllers: [SchedulingController],
  exports: [SchedulingService],
})
export class SchedulingModule {}