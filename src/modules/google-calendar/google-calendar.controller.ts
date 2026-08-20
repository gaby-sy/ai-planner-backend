import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoogleCalendarService } from './google-calendar.service';
import { ConnectGoogleCalendarDto } from './dto/connect-google-calendar.dto';
import { GoogleAuthUrlQueryDto } from './dto/google-auth-url-query.dto';

@ApiTags('integrations')
@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get the Google Calendar integration status for the current user',
  })
  getStatus(@CurrentUser() user: User) {
    return this.googleCalendarService.getStatus(user.id);
  }

  @Get('auth-url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a Google OAuth consent URL' })
  getAuthUrl(@CurrentUser() user: User, @Query() query: GoogleAuthUrlQueryDto) {
    return this.googleCalendarService.getAuthUrl(
      user.id,
      query.redirectUri,
      query.platform,
    );
  }

  @Post('connect')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Exchange an authorization code for tokens (mobile flow)',
  })
  connect(@CurrentUser() user: User, @Body() dto: ConnectGoogleCalendarDto) {
    return this.googleCalendarService.connect(
      user.id,
      dto.code,
      dto.redirectUri,
    );
  }

  @Post('sync')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Trigger an on-demand two-way sync with Google Calendar',
  })
  sync(@CurrentUser() user: User) {
    return this.googleCalendarService.sync(user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Disconnect Google Calendar and revoke stored tokens',
  })
  disconnect(@CurrentUser() user: User) {
    return this.googleCalendarService.disconnect(user.id);
  }

  // Hit directly by Google's redirect after user consent (web flow) — no
  // Authorization header is present, so this route is intentionally not
  // behind JwtAuthGuard. The user is identified via the signed `state` param.
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const clientUrl = this.config.getOrThrow<string>('CLIENT_URL');

    try {
      if (error || !code || !state) {
        throw new Error(error ?? 'Missing code or state');
      }
      await this.googleCalendarService.handleWebCallback(code, state);
      res.redirect(`${clientUrl}/settings?googleCalendar=success`);
    } catch {
      res.redirect(`${clientUrl}/settings?googleCalendar=error`);
    }
  }
}
