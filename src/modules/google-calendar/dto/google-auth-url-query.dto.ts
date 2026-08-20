import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum GoogleCalendarPlatform {
  WEB = 'web',
  MOBILE = 'mobile',
}

export class GoogleAuthUrlQueryDto {
  @ApiPropertyOptional({
    description:
      'Redirect URI Google should send the user back to. Required for platform=mobile ' +
      "(the app's custom URL scheme); ignored for platform=web, which always uses the " +
      "backend's own HTTPS callback route.",
    example: 'com.aiplanner.mobile://oauth/callback',
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiProperty({
    enum: GoogleCalendarPlatform,
    example: GoogleCalendarPlatform.WEB,
  })
  @IsEnum(GoogleCalendarPlatform)
  platform: GoogleCalendarPlatform;
}
