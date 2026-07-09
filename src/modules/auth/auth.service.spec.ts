import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { ConflictException, UnauthorizedException } from '@common/exceptions/app.exception';
import * as hashUtil from '@shared/hash.util';
import { Role, UserStatus } from '@prisma/client';

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  password: '$2b$12$hashedpassword',
  role: Role.ADMIN,
  status: UserStatus.ACTIVE,
  phone: null,
  department: null,
  avatar: null,
  lastLogin: null,
  permissions: [],
  provinces: [],
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
      jest.spyOn(hashUtil, 'hashToken').mockResolvedValue('hashed-refresh');

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
});
