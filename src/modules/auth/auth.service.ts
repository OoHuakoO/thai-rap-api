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
      throw new ConflictException('USER_002', 'Email already exists');
    }

    const hashedPassword = await hashPassword(dto.password);
    const user = await this.authRepository.createUser({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      role: dto.role,
      phone: dto.phone,
      department: dto.department,
      provinces: dto.provinces ?? [],
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
      throw new UnauthorizedException('AUTH_001', 'Invalid credentials');
    }

    const isPasswordValid = await comparePassword(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('AUTH_001', 'Invalid credentials');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('AUTH_005', 'Account is suspended');
    }

    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException('AUTH_006', 'Account is pending activation');
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
      throw new UnauthorizedException('AUTH_004', 'Refresh token not found');
    }

    if (tokenRecord.revokedAt) {
      throw new UnauthorizedException('AUTH_004', 'Refresh token has been revoked');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('AUTH_004', 'Refresh token has expired');
    }

    const isValid = await compareToken(rawRefreshToken, tokenRecord.tokenHash);
    if (!isValid) {
      throw new UnauthorizedException('AUTH_004', 'Refresh token is invalid');
    }

    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException('USER_001', 'User not found');
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
      throw new NotFoundException('USER_001', 'User not found');
    }
    return this.omitPassword(user);
  }

  private async issueTokens(userId: string, email: string, role: string): Promise<AuthTokens> {
    const payload = { sub: userId, email, role };

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

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private async storeRefreshToken(userId: string, rawToken: string): Promise<void> {
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + this.configService.get<number>('auth.jwtRefreshExpiresInDays', 7),
    );
    await this.authRepository.upsertRefreshToken({ userId, tokenHash, expiresAt });
  }

  private omitPassword(user: User): Omit<User, 'password'> {
    const { password: _password, ...rest } = user;
    return rest;
  }
}
