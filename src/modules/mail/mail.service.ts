import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('mail.from', 'Thai Rap <no-reply@thai-rap.local>');
    this.transporter = this.createTransporter();
  }

  // Sends are fire-and-forget by design, so a wrong host or a rejected password
  // would otherwise stay invisible until a user reported a missing OTP.
  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('mail.host');

    if (!this.transporter) {
      this.logger.warn(
        'SMTP not configured — password reset OTPs are written to this log, not emailed',
      );
      return;
    }

    try {
      await this.transporter.verify();
      this.logger.log(`SMTP ready — ${host} as ${this.from}`);
    } catch (error) {
      this.logger.error(
        `SMTP login to ${host} failed — password reset emails will not be delivered: ${(error as Error).message}`,
      );
    }
  }

  async sendPasswordResetOtp(to: string, name: string, otp: string, expiresInMinutes: number) {
    const subject = 'รหัส OTP สำหรับรีเซ็ตรหัสผ่าน — Thai Rap';
    const text = [
      `สวัสดีคุณ ${name}`,
      '',
      `รหัส OTP สำหรับตั้งรหัสผ่านใหม่ของคุณคือ ${otp}`,
      `รหัสนี้ใช้ได้ภายใน ${expiresInMinutes} นาที และใช้ได้เพียงครั้งเดียว`,
      '',
      'หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน โปรดเพิกเฉยต่ออีเมลฉบับนี้',
    ].join('\n');

    if (!this.transporter) {
      this.logger.warn(`SMTP not configured — password reset OTP for ${to}: ${otp}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html: this.buildOtpHtml(name, otp, expiresInMinutes),
      });
    } catch (error) {
      // Swallowed on purpose: the caller answers 200 regardless so a failed send
      // cannot be used to probe which addresses exist.
      this.logger.error(
        `Failed to send password reset OTP to ${to}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private createTransporter(): Transporter | null {
    const host = this.configService.get<string>('mail.host');
    if (!host) return null;

    const user = this.configService.get<string>('mail.user');
    const password = this.configService.get<string>('mail.password');

    // A hosted provider always requires auth, so half-filled config would drop
    // the OTP entirely. Fall back to the log instead of losing it.
    if (this.configService.get<string>('mail.provider') && !user) return null;
    const secure = this.configService.get<boolean>('mail.secure', false);

    return createTransport({
      host,
      port: this.configService.get<number>('mail.port', 587),
      secure,
      // Office 365 drops a submission that stays in plaintext, and both providers
      // require TLS 1.2 or newer on the STARTTLS port.
      requireTLS: !secure,
      tls: { minVersion: 'TLSv1.2' },
      auth: user ? { user, pass: password } : undefined,
    });
  }

  private buildOtpHtml(name: string, otp: string, expiresInMinutes: number): string {
    return `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#2B2B2B;line-height:1.7">
        <p>สวัสดีคุณ ${name}</p>
        <p>รหัส OTP สำหรับตั้งรหัสผ่านใหม่ของคุณคือ</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#F97316;margin:24px 0">${otp}</p>
        <p>รหัสนี้ใช้ได้ภายใน ${expiresInMinutes} นาที และใช้ได้เพียงครั้งเดียว</p>
        <p style="color:#6B7280;font-size:13px">หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน โปรดเพิกเฉยต่ออีเมลฉบับนี้</p>
      </div>
    `;
  }
}
