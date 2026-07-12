import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScheduleTaskDto {
  @ApiProperty({ description: 'Task ID to schedule' })
  @IsUUID()
  taskId: string;

  @ApiPropertyOptional({
    description: 'Earliest start for search window (defaults to now)',
    example: '2026-06-23T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  windowStart?: string;

  @ApiPropertyOptional({
    description: 'Latest end for search window (defaults to due date or +7 days)',
    example: '2026-06-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601()
  windowEnd?: string;
}
