import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({
    example: 'What should I focus on today?',
    description: 'Natural language message to the AI assistant',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}