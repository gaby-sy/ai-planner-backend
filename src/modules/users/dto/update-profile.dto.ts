import {
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  IsInt,
  Min,
  Max,
  IsTimeZone,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ example: '09:00', description: 'Work day start HH:mm' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'workStartTime must be HH:mm' })
  workStartTime?: string;

  @ApiPropertyOptional({ example: '17:00', description: 'Work day end HH:mm' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'workEndTime must be HH:mm' })
  workEndTime?: string;

  @ApiPropertyOptional({
    example: [1, 2, 3, 4, 5],
    description: 'Work days 0=Sun 6=Sat',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @Type(() => Number)
  workDays?: number[];

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'preferredFocusStart must be HH:mm' })
  preferredFocusStart?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'preferredFocusEnd must be HH:mm' })
  preferredFocusEnd?: string;

  @ApiPropertyOptional({ example: 15, description: 'Buffer minutes between tasks' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  bufferBetweenTasks?: number;
}