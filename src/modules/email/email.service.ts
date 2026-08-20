import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Email-sending service backed by Resend (https://resend.com).
 *
 * If `RESEND_API_KEY` is not configured (e.g. local dev without a Resend
 * account), this falls back to logging the email to the console instead of
 * sending it, so the app still runs without requiring a provider account.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress =
      this.config.get<string>('EMAIL_FROM') ??
      'AI Planner <onboarding@resend.dev>';

    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.resend = null;
      this.logger.warn(
        'RESEND_API_KEY is not set — emails will be logged to the console instead of sent.',
      );
    }
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(
        `[dev] Password reset email for ${email} — reset link: ${resetUrl}`,
      );
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: email,
        subject: 'Reset your password',
        html: this.renderPasswordResetHtml(resetUrl),
      });

      if (error) {
        this.logger.error(
          `Resend rejected password reset email to ${email}: ${error.message}`,
        );
        return;
      }

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to send password reset email to ${email}: ${message}`,
      );
    }
  }

  private renderPasswordResetHtml(resetUrl: string): string {
    return `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>We received a request to reset your AI Planner password. This link expires in 1 hour.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">
            Reset password
          </a>
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;
  }
}
