import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Team Standup' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2026-06-23T09:00:00.000Z' })
  @IsISO8601()
  startTime: string;

  @ApiProperty({ example: '2026-06-23T09:30:00.000Z' })
  @IsISO8601()
  endTime: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({ example: '#4A90D9' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'iCal RRULE for recurring events' })
  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}