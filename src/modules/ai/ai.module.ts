import { Module } from '@nestjs/common';
import { TaskExtractorService } from './task-extractor.service';
import { AiChatService } from './ai-chat.service';
import { AiController } from './ai.controller';

@Module({
  providers: [TaskExtractorService, AiChatService],
  controllers: [AiController],
  exports: [TaskExtractorService, AiChatService],
})
export class AiModule {}