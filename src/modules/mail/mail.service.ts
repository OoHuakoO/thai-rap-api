import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('mail.from', 'Thai Rap <no-reply@thai-rap.local>');
    this.transporter = this.createTransporter();
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
      this.logger.error(`Failed to send password reset OTP to ${to}`, error as Error);
    }
  }

  private createTransporter(): Transporter | null {
    const host = this.configService.get<string>('mail.host');
    if (!host) return null;

    const user = this.configService.get<string>('mail.user');
    const password = this.configService.get<string>('mail.password');

    return createTransport({
      host,
      port: this.configService.get<number>('mail.port', 587),
      secure: this.configService.get<boolean>('mail.secure', false),
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
