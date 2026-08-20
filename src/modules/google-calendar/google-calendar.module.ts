import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarController } from './google-calendar.controller';

@Module({
  imports: [
    JwtModule.register({}), // secrets injected per-call via ConfigService (see GoogleCalendarService)
  ],
  providers: [GoogleCalendarService],
  controllers: [GoogleCalendarController],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
