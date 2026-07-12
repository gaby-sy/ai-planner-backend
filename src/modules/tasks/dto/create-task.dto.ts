import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTaskDto {
  @ApiProperty({ example: 'Car Inspection' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Book through the city inspection portal' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ example: 60, description: 'Estimated duration in minutes' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Min(1)
  estimatedDuration?: number;

  @ApiPropertyOptional({ example: '2026-06-28T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ example: ['work', 'car'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: '08:00', description: 'Business hours start (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'businessHoursStart must be HH:mm' })
  businessHoursStart?: string;

  @ApiPropertyOptional({ example: '17:00', description: 'Business hours end (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'businessHoursEnd must be HH:mm' })
  businessHoursEnd?: string;
}
