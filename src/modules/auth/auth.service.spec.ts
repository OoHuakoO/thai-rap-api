import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { MailService } from '@modules/mail/mail.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
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
  let mailService: jest.Mocked<MailService>;

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
            updatePassword: jest.fn(),
            upsertPasswordResetOtp: jest.fn(),
            findPasswordResetOtp: jest.fn(),
            incrementPasswordResetOtpAttempts: jest.fn(),
            consumePasswordResetOtp: jest.fn(),
            deletePasswordResetOtp: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() },
        },
        {
          provide: MailService,
          useValue: { sendPasswordResetOtp: jest.fn() },
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
                'mail.otpExpiresInMinutes': 10,
                'mail.otpMaxAttempts': 5,
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
    mailService = module.get(MailService);
  });

  describe('register', () => {
    it('should create a PENDING account and issue no tokens', async () => {
      repository.findUserByEmail.mockResolvedValue(null);
      repository.createUser.mockResolvedValue({ ...mockUser, status: UserStatus.PENDING });

      jest.spyOn(hashUtil, 'hashPassword').mockResolvedValue('hashed');

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'P@ssw0rd123',
        role: Role.ADMIN,
      });

      expect(result.user.email).toBe('test@example.com');
      expect((result.user as any).password).toBeUndefined();
      expect(result.user.status).toBe(UserStatus.PENDING);
      expect(repository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.PENDING }),
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(repository.upsertRefreshToken).not.toHaveBeenCalled();
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

  describe('forgotPassword', () => {
    it('should store a hashed otp and email it to the user', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      repository.upsertPasswordResetOtp.mockResolvedValue({} as any);
      jest.spyOn(hashUtil, 'hashPassword').mockResolvedValue('hashed-otp');

      await service.forgotPassword({ email: 'test@example.com' });

      expect(repository.upsertPasswordResetOtp).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', otpHash: 'hashed-otp' }),
      );
      const [to, name, otp] = mailService.sendPasswordResetOtp.mock.calls[0];
      expect(to).toBe('test@example.com');
      expect(name).toBe('Test User');
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should resolve silently when the email is not registered', async () => {
      repository.findUserByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(repository.upsertPasswordResetOtp).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetOtp).not.toHaveBeenCalled();
    });

    it('should not send an otp to a suspended account', async () => {
      repository.findUserByEmail.mockResolvedValue({ ...mockUser, status: UserStatus.SUSPENDED });

      await service.forgotPassword({ email: 'test@example.com' });

      expect(mailService.sendPasswordResetOtp).not.toHaveBeenCalled();
    });
  });

  describe('verifyResetOtp', () => {
    const otpRecord = {
      id: 'otp-1',
      userId: 'user-1',
      otpHash: 'hashed-otp',
      expiresAt: new Date(Date.now() + 600_000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    } as any;

    it('should consume the otp and return a reset token', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue(otpRecord);
      repository.consumePasswordResetOtp.mockResolvedValue(otpRecord);
      jest.spyOn(hashUtil, 'comparePassword').mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('reset-token');

      const result = await service.verifyResetOtp({ email: 'test@example.com', otp: '123456' });

      expect(result.resetToken).toBe('reset-token');
      expect(repository.consumePasswordResetOtp).toHaveBeenCalledWith('user-1');
    });

    it('should count a wrong otp against the attempt limit', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue(otpRecord);
      repository.incrementPasswordResetOtpAttempts.mockResolvedValue(otpRecord);
      jest.spyOn(hashUtil, 'comparePassword').mockResolvedValue(false);

      await expect(
        service.verifyResetOtp({ email: 'test@example.com', otp: '000000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.incrementPasswordResetOtpAttempts).toHaveBeenCalledWith('user-1');
    });

    it('should reject an expired otp', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue({
        ...otpRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyResetOtp({ email: 'test@example.com', otp: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.consumePasswordResetOtp).not.toHaveBeenCalled();
    });

    it('should reject an otp that was already used', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue({ ...otpRecord, consumedAt: new Date() });

      await expect(
        service.verifyResetOtp({ email: 'test@example.com', otp: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should reject once the attempt limit is exhausted', async () => {
      repository.findUserByEmail.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue({ ...otpRecord, attempts: 5 });

      await expect(
        service.verifyResetOtp({ email: 'test@example.com', otp: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.incrementPasswordResetOtpAttempts).not.toHaveBeenCalled();
    });

    it('should reject an unknown email without revealing it', async () => {
      repository.findUserByEmail.mockResolvedValue(null);

      await expect(
        service.verifyResetOtp({ email: 'nobody@example.com', otp: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    const consumedOtp = {
      id: 'otp-1',
      userId: 'user-1',
      otpHash: 'hashed-otp',
      expiresAt: new Date(Date.now() + 600_000),
      attempts: 0,
      consumedAt: new Date(),
      createdAt: new Date(),
    } as any;

    it('should set the new password, drop the otp and revoke the session', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: 'password-reset' });
      repository.findUserById.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue(consumedOtp);
      repository.updatePassword.mockResolvedValue(mockUser);
      repository.deletePasswordResetOtp.mockResolvedValue({ count: 1 });
      repository.findRefreshToken.mockResolvedValue({ id: 'token-1' } as any);
      repository.revokeRefreshToken.mockResolvedValue({} as any);
      jest.spyOn(hashUtil, 'hashPassword').mockResolvedValue('new-hashed');

      await service.resetPassword({ resetToken: 'reset-token', password: 'N3wP@ssw0rd' });

      expect(repository.updatePassword).toHaveBeenCalledWith('user-1', 'new-hashed');
      expect(repository.deletePasswordResetOtp).toHaveBeenCalledWith('user-1');
      expect(repository.revokeRefreshToken).toHaveBeenCalledWith('user-1');
    });

    it('should throw UnauthorizedException when the reset token does not verify', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        service.resetPassword({ resetToken: 'bad-token', password: 'N3wP@ssw0rd' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should reject a token minted for another purpose', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

      await expect(
        service.resetPassword({ resetToken: 'access-token', password: 'N3wP@ssw0rd' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.updatePassword).not.toHaveBeenCalled();
    });

    it('should reject a token whose otp row is already gone', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: 'password-reset' });
      repository.findUserById.mockResolvedValue(mockUser);
      repository.findPasswordResetOtp.mockResolvedValue(null);

      await expect(
        service.resetPassword({ resetToken: 'reset-token', password: 'N3wP@ssw0rd' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repository.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the user no longer exists', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: 'password-reset' });
      repository.findUserById.mockResolvedValue(null);

      await expect(
        service.resetPassword({ resetToken: 'reset-token', password: 'N3wP@ssw0rd' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
