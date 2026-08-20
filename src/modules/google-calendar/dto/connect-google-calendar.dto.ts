import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectGoogleCalendarDto {
  @ApiProperty({
    description: 'Authorization code returned by Google after user consent',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description:
      'The exact redirect URI used to obtain the code (must match what was passed to /auth-url)',
    example: 'com.aiplanner.mobile://oauth/callback',
  })
  @IsString()
  @IsNotEmpty()
  redirectUri: string;
}
