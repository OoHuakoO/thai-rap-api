import { Injectable } from '@nestjs/common';
import type { Prisma, User, RefreshToken } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
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
}
