import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityType } from '@prisma/client';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SetAvailabilityDto {
  @ApiProperty({ example: 1, description: '0=Sun 6=Sat' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_REGEX, { message: 'startTime must be HH:mm' })
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @Matches(TIME_REGEX, { message: 'endTime must be HH:mm' })
  endTime: string;

  @ApiProperty({ enum: AvailabilityType })
  @IsEnum(AvailabilityType)
  type: AvailabilityType;

  @ApiPropertyOptional({ example: 'Deep Work' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;
}