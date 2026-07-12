import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtractTaskDto {
  @ApiProperty({
    example:
      'I need to do a car inspection this week. It takes around one hour and the office is open from 8am to 5pm.',
    description: 'Free-text description from which the AI extracts task details',
  })
  @IsString()
  @IsNotEmpty()
  text: string;
}