import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaskExtractorService } from './task-extractor.service';
import { AiChatService } from './ai-chat.service';
import { ExtractTaskDto } from './dto/extract-task.dto';
import { ChatDto } from './dto/chat.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly taskExtractor: TaskExtractorService,
    private readonly aiChat: AiChatService,
  ) {}

  @Post('extract-task')
  @ApiOperation({
    summary: 'Extract a structured task from free-text description',
    description:
      'Send a natural language sentence and get back structured task fields (title, duration, due date, business hours, etc.)',
  })
  @ApiResponse({
    status: 201,
    description: 'Extracted task fields',
    schema: {
      example: {
        title: 'Car Inspection',
        estimatedDuration: 60,
        dueDate: '2026-06-28T00:00:00.000Z',
        businessHoursStart: '08:00',
        businessHoursEnd: '17:00',
        priority: 'MEDIUM',
        tags: ['car', 'admin'],
      },
    },
  })
  extractTask(@Body() dto: ExtractTaskDto) {
    return this.taskExtractor.extract(dto.text);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'Chat with the AI planning assistant',
    description:
      'Ask questions like "What should I focus on today?" or "What are my urgent tasks?"',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        message:
          "Focus on 'Car Inspection' first — it's due Friday and needs a specific business hours window.",
        timestamp: '2026-06-21T09:00:00.000Z',
      },
    },
  })
  chat(@CurrentUser() user: User, @Body() dto: ChatDto) {
    return this.aiChat.chat(user.id, dto.message);
  }
}