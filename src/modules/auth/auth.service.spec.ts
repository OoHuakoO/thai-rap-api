import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@common/exceptions/app.exception';
import * as hashUtil from '@shared/hash.util';
import { Role, UserStatus, type User } from '@prisma/client';

const mockUser: User = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  password: '$2b$12$hashedpassword',
  role: Role.ADMIN,
  status: UserStatus.ACTIVE,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let repository: jest.Mocked<AuthRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthRepository,
          useValue: {
            findUserByEmail: jest.fn(),
            findUserById: jest.fn(),
            createUser: jest.fn(),
            deleteUser: jest.fn(),
            updateLastLogin: jest.fn(),
            upsertRefreshToken: jest.fn(),
            findRefreshToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const map: Record<string, unknown> = {
                'auth.jwtAccessSecret': 'test-access-secret',
                'auth.jwtRefreshSecret': 'test-refresh-secret',
                'auth.jwtAccessExpiresIn': '15m',
                'auth.jwtAccessExpiresInSeconds': 900,
                'auth.jwtRefreshExpiresIn': '7d',
                'auth.jwtRefreshExpiresInDays': 7,
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repository = module.get(AuthRepository);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      repository.findUserByEmail.mockResolvedValue(null);
      repository.createUser.mockResolvedValue(mockUser);
      repository.upsertRefreshToken.mockResolvedValue({} as any);
      jwtService.signAsync.mockResolvedValue('mock-token');

      jest.spyOn(hashUtil, 'hashPassword').mockResolvedValue('hashed');
      jest.spyOn(hashUtil, 'hashToken').mockReturnValue('hashed-refresh');

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'P@ssw0rd123',
        role: Role.ADMIN,
      });

      expect(result.user.email).toBe('test@example.com');
      expect((result.user as any).password).toBeUndefined();
      expect(result.tokens.accessToken).toBe('mock-token');
    });

    it('should throw ConflictException when email exists', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          name: 'Test',
          email: 'test@example.com',
          password: 'P@ssw0rd123',
          role: Role.ADMIN,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException when user not found', async () => {
      repository.findUserByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      jest.spyOn(hashUtil, 'comparePassword').mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const mockTokenRecord = {
      id: 'token-1',
      userId: 'user-1',
      tokenHash: 'stored-hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    it('should issue new tokens for a valid refresh token', async () => {
      repository.findRefreshToken.mockResolvedValue(mockTokenRecord);
      repository.findUserById.mockResolvedValue(mockUser);
      repository.upsertRefreshToken.mockResolvedValue({} as any);
      jwtService.signAsync.mockResolvedValue('mock-token');
      jest.spyOn(hashUtil, 'compareToken').mockReturnValue(true);
      jest.spyOn(hashUtil, 'hashToken').mockReturnValue('hashed-refresh');

      const result = await service.refresh('user-1', 'raw-refresh-token');

      expect(result.accessToken).toBe('mock-token');
      expect(repository.upsertRefreshToken).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when refresh token not found', async () => {
      repository.findRefreshToken.mockResolvedValue(null);

      await expect(service.refresh('user-1', 'raw-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when refresh token hash does not match', async () => {
      repository.findRefreshToken.mockResolvedValue(mockTokenRecord);
      jest.spyOn(hashUtil, 'compareToken').mockReturnValue(false);

      await expect(service.refresh('user-1', 'raw-refresh-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException when user is suspended', async () => {
      repository.findRefreshToken.mockResolvedValue(mockTokenRecord);
      repository.findUserById.mockResolvedValue({ ...mockUser, status: UserStatus.SUSPENDED });
      jest.spyOn(hashUtil, 'compareToken').mockReturnValue(true);

      await expect(service.refresh('user-1', 'raw-refresh-token')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when user is pending activation', async () => {
      repository.findRefreshToken.mockResolvedValue(mockTokenRecord);
      repository.findUserById.mockResolvedValue({ ...mockUser, status: UserStatus.PENDING });
      jest.spyOn(hashUtil, 'compareToken').mockReturnValue(true);

      await expect(service.refresh('user-1', 'raw-refresh-token')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
