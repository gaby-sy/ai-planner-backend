import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService, NOTIFICATIONS_QUEUE } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsController } from './notifications.controller';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
    }),
    forwardRef(() => WebsocketModule),
  ],
  providers: [NotificationsService, NotificationsProcessor],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}