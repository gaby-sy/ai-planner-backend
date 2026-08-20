import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal email-sending abstraction. This implementation just logs to the
 * console — no SMTP/provider integration yet. Swap the body of these methods
 * for a real provider (e.g. Nodemailer, SendGrid, SES) later without having
 * to touch any of the call sites.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    this.logger.log(
      `[stub] Password reset email for ${email} — reset link: ${resetUrl}`,
    );
  }
}