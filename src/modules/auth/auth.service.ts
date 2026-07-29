import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'crypto';
import type { User } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { MailService } from '@modules/mail/mail.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import {
  PASSWORD_RESET_OTP_LENGTH,
  PASSWORD_RESET_TOKEN_EXPIRES_IN,
  PASSWORD_RESET_TOKEN_PURPOSE,
} from './auth.const';
import {
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@common/exceptions/app.exception';
import { ERROR_CODES } from '@constants/index';
import { hashPassword, comparePassword, hashToken, compareToken } from '@shared/hash.util';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: Omit<User, 'password'>;
  tokens: AuthTokens;
}

export interface RegisterResult {
  user: Omit<User, 'password'>;
}

export interface VerifyOtpResult {
  resetToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // Signing up creates the account but not a session: the row lands PENDING and
  // login/refresh both reject that status, so nobody gets in until a SUPER_ADMIN
  // approves through PATCH /users/:id/approve. No tokens are issued here at all
  // — an approval step that hands out a 7-day refresh token first is not one.
  async register(dto: RegisterDto): Promise<RegisterResult> {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException(ERROR_CODES.USER.EMAIL_EXISTS, 'อีเมลนี้ถูกใช้งานแล้ว');
    }

    const hashedPassword = await hashPassword(dto.password);
    const user = await this.authRepository.createUser({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      role: dto.role,
      status: UserStatus.PENDING,
    });

    return { user: this.omitPassword(user) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.INVALID_CREDENTIALS,
        'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      );
    }

    const isPasswordValid = await comparePassword(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.INVALID_CREDENTIALS,
        'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      );
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException(ERROR_CODES.AUTH.ACCOUNT_SUSPENDED, 'บัญชีถูกระงับการใช้งาน');
    }

    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException(ERROR_CODES.AUTH.ACCOUNT_PENDING, 'บัญชีกำลังรอการเปิดใช้งาน');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await Promise.all([
      this.storeRefreshToken(user.id, tokens.refreshToken),
      this.authRepository.updateLastLogin(user.id),
    ]);

    return { user: this.omitPassword(user), tokens };
  }

  async refresh(userId: string, rawRefreshToken: string): Promise<AuthTokens> {
    const tokenRecord = await this.authRepository.findRefreshToken(userId);
    if (!tokenRecord) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID,
        'ไม่พบ refresh token',
      );
    }

    if (tokenRecord.revokedAt) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID,
        'refresh token ถูกยกเลิกไปแล้ว',
      );
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID,
        'refresh token หมดอายุแล้ว',
      );
    }

    const isValid = compareToken(rawRefreshToken, tokenRecord.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.REFRESH_TOKEN_INVALID,
        'refresh token ไม่ถูกต้อง',
      );
    }

    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.USER.NOT_FOUND, 'ไม่พบผู้ใช้งาน');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException(ERROR_CODES.AUTH.ACCOUNT_SUSPENDED, 'บัญชีถูกระงับการใช้งาน');
    }

    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException(ERROR_CODES.AUTH.ACCOUNT_PENDING, 'บัญชีกำลังรอการเปิดใช้งาน');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    const tokenRecord = await this.authRepository.findRefreshToken(userId);
    if (tokenRecord) {
      await this.authRepository.revokeRefreshToken(userId);
    }
  }

  // Always resolves, whatever the email is: a caller must not be able to tell a
  // registered address from an unregistered one by the shape of the response.
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user || user.status === UserStatus.SUSPENDED) return;

    const otp = this.generateOtp();
    const expiresInMinutes = this.configService.get<number>('mail.otpExpiresInMinutes', 10);
    const otpHash = await hashPassword(otp);

    await this.authRepository.upsertPasswordResetOtp({
      userId: user.id,
      otpHash,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    });

    await this.mailService.sendPasswordResetOtp(user.email, user.name, otp, expiresInMinutes);
  }

  async verifyResetOtp(dto: VerifyOtpDto): Promise<VerifyOtpResult> {
    const user = await this.authRepository.findUserByEmail(dto.email);
    if (!user) {
      throw new BadRequestException(ERROR_CODES.AUTH.OTP_INVALID, 'รหัส OTP ไม่ถูกต้อง');
    }

    const record = await this.authRepository.findPasswordResetOtp(user.id);
    if (!record || record.consumedAt) {
      throw new BadRequestException(ERROR_CODES.AUTH.OTP_INVALID, 'รหัส OTP ไม่ถูกต้อง');
    }

    if (new Date() > record.expiresAt) {
      throw new BadRequestException(ERROR_CODES.AUTH.OTP_EXPIRED, 'รหัส OTP หมดอายุแล้ว');
    }

    const maxAttempts = this.configService.get<number>('mail.otpMaxAttempts', 5);
    if (record.attempts >= maxAttempts) {
      throw new BadRequestException(
        ERROR_CODES.AUTH.OTP_ATTEMPTS_EXCEEDED,
        'กรอกรหัส OTP ผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่',
      );
    }

    const isOtpValid = await comparePassword(dto.otp, record.otpHash);
    if (!isOtpValid) {
      await this.authRepository.incrementPasswordResetOtpAttempts(user.id);
      throw new BadRequestException(ERROR_CODES.AUTH.OTP_INVALID, 'รหัส OTP ไม่ถูกต้อง');
    }

    await this.authRepository.consumePasswordResetOtp(user.id);

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, purpose: PASSWORD_RESET_TOKEN_PURPOSE },
      { secret: this.getPasswordResetSecret(), expiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN },
    );

    return { resetToken, expiresIn: 10 * 60 };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; purpose?: string }>(
        dto.resetToken,
        { secret: this.getPasswordResetSecret() },
      );
    } catch {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.RESET_TOKEN_INVALID,
        'ลิงก์ตั้งรหัสผ่านใหม่ไม่ถูกต้องหรือหมดอายุแล้ว',
      );
    }

    if (payload.purpose !== PASSWORD_RESET_TOKEN_PURPOSE) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.RESET_TOKEN_INVALID,
        'ลิงก์ตั้งรหัสผ่านใหม่ไม่ถูกต้องหรือหมดอายุแล้ว',
      );
    }

    const user = await this.authRepository.findUserById(payload.sub);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.USER.NOT_FOUND, 'ไม่พบผู้ใช้งาน');
    }

    // The OTP row must still be there and consumed — deleting it here is what stops
    // one verify from minting a token that resets the password more than once.
    const record = await this.authRepository.findPasswordResetOtp(user.id);
    if (!record?.consumedAt) {
      throw new UnauthorizedException(
        ERROR_CODES.AUTH.RESET_TOKEN_INVALID,
        'ลิงก์ตั้งรหัสผ่านใหม่ไม่ถูกต้องหรือหมดอายุแล้ว',
      );
    }

    await this.authRepository.updatePassword(user.id, await hashPassword(dto.password));
    await this.authRepository.deletePasswordResetOtp(user.id);

    // Every existing session dies with the old password.
    const tokenRecord = await this.authRepository.findRefreshToken(user.id);
    if (tokenRecord) {
      await this.authRepository.revokeRefreshToken(user.id);
    }
  }

  private generateOtp(): string {
    const max = 10 ** PASSWORD_RESET_OTP_LENGTH;
    return String(randomInt(0, max)).padStart(PASSWORD_RESET_OTP_LENGTH, '0');
  }

  // Derived rather than its own env var, but still distinct from the access secret:
  // a reset token signed with the access secret would pass JwtAccessStrategy and
  // authenticate as a roleless user.
  private getPasswordResetSecret(): string {
    const accessSecret = this.configService.get<string>('auth.jwtAccessSecret') as string;
    return createHmac('sha256', accessSecret).update(PASSWORD_RESET_TOKEN_PURPOSE).digest('hex');
  }

  private async issueTokens(userId: string, email: string, role: string): Promise<AuthTokens> {
    const payload = { sub: userId, email, role };
    const expiresIn = this.configService.get<number>('auth.jwtAccessExpiresInSeconds', 900);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('auth.jwtAccessSecret'),
        expiresIn: this.configService.get<string>('auth.jwtAccessExpiresIn', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('auth.jwtRefreshSecret'),
        expiresIn: this.configService.get<string>('auth.jwtRefreshExpiresIn', '7d'),
      }),
    ]);

    return { accessToken, refreshToken, expiresIn };
  }

  private async storeRefreshToken(userId: string, rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const days = this.configService.get<number>('auth.jwtRefreshExpiresInDays', 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.authRepository.upsertRefreshToken({ userId, tokenHash, expiresAt });
  }

  private omitPassword(user: User): Omit<User, 'password'> {
    const { password: _password, ...rest } = user;
    return rest;
  }
}
