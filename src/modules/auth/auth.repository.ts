import { Injectable } from '@nestjs/common';
import type { Prisma, User, RefreshToken, PasswordResetOtp } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

const USER_SELECT_NO_PASSWORD = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<Omit<User, 'password'> | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT_NO_PASSWORD });
  }

  createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  updateLastLogin(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  upsertRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    return this.prisma.refreshToken.upsert({
      where: { userId: data.userId },
      update: {
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
      },
      create: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  findRefreshToken(userId: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { userId } });
  }

  revokeRefreshToken(userId: string): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  deleteUser(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }

  updatePassword(userId: string, password: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { password } });
  }

  upsertPasswordResetOtp(data: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetOtp> {
    return this.prisma.passwordResetOtp.upsert({
      where: { userId: data.userId },
      update: {
        otpHash: data.otpHash,
        expiresAt: data.expiresAt,
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
      },
      create: {
        userId: data.userId,
        otpHash: data.otpHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  findPasswordResetOtp(userId: string): Promise<PasswordResetOtp | null> {
    return this.prisma.passwordResetOtp.findUnique({ where: { userId } });
  }

  incrementPasswordResetOtpAttempts(userId: string): Promise<PasswordResetOtp> {
    return this.prisma.passwordResetOtp.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
  }

  consumePasswordResetOtp(userId: string): Promise<PasswordResetOtp> {
    return this.prisma.passwordResetOtp.update({
      where: { userId },
      data: { consumedAt: new Date() },
    });
  }

  deletePasswordResetOtp(userId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.passwordResetOtp.deleteMany({ where: { userId } });
  }
}
