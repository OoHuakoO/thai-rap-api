import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import {
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
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
      status: UserStatus.ACTIVE,
    });

    try {
      const tokens = await this.issueTokens(user.id, user.email, user.role);
      await this.storeRefreshToken(user.id, tokens.refreshToken);
      return { user: this.omitPassword(user), tokens };
    } catch (error) {
      await this.authRepository.deleteUser(user.id).catch(() => {});
      throw error;
    }
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

  async getMe(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.USER.NOT_FOUND, 'ไม่พบผู้ใช้งาน');
    }
    return user;
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
