import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { UserStatus } from '../users/entities/user.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByIdOrThrow: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updatePasswordHash: vi.fn(),
  };

  const mockJwtService = {
    sign: vi.fn().mockReturnValue('mock-jwt-access-token'),
  };

  const mockRefreshTokenRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  const mockPasswordResetTokenRepository = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: mockPasswordResetTokenRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signup', () => {
    it('should throw ConflictException if email is already taken', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.signup({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register a new user without returning password_hash', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'u-1',
        full_name: 'Test User',
        email: 'test@example.com',
        avatar_url: null,
        status: UserStatus.OFFLINE,
        created_at: new Date(),
        password_hash: 'hashed-secret',
      });

      const result = await service.signup({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(mockUsersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Test User',
          email: 'test@example.com',
          status: UserStatus.OFFLINE,
          is_email_verified: false,
        }),
      );
      expect(result.id).toBe('u-1');
      expect((result as any).password_hash).toBeUndefined();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException on unknown email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on incorrect password', async () => {
      const passwordHash = await argon2.hash('CorrectPassword123!');
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
        password_hash: passwordHash,
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens and user on successful login', async () => {
      const password = 'CorrectPassword123!';
      const passwordHash = await argon2.hash(password);
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'u-1',
        full_name: 'Test User',
        email: 'test@example.com',
        password_hash: passwordHash,
        avatar_url: null,
        status: UserStatus.OFFLINE,
      });

      mockRefreshTokenRepository.create.mockReturnValue({
        id: 'rt-1',
        user_id: 'u-1',
      });
      mockRefreshTokenRepository.save.mockImplementation((e) =>
        Promise.resolve({ id: 'rt-1', ...e }),
      );

      const result = await service.login({
        email: 'test@example.com',
        password,
      });

      expect(result.accessToken).toBe('mock-jwt-access-token');
      expect(result.refreshToken).toContain('rt-1.');
      expect(result.user.id).toBe('u-1');
      expect(result.user.status).toBe(UserStatus.ONLINE);
      expect(mockUsersService.updateStatus).toHaveBeenCalledWith(
        'u-1',
        UserStatus.ONLINE,
      );
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException if refresh token not found', async () => {
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'invalid.token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should issue new access token on valid refresh token', async () => {
      const rawToken = 'rt-1.secret123';
      const tokenHash = await argon2.hash(rawToken);

      mockRefreshTokenRepository.findOne.mockResolvedValue({
        id: 'rt-1',
        user_id: 'u-1',
        token_hash: tokenHash,
        is_revoked: false,
        expires_at: new Date(Date.now() + 100000),
      });

      mockUsersService.findById.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
      });

      const result = await service.refresh({ refreshToken: rawToken });
      expect(result.accessToken).toBe('mock-jwt-access-token');
    });
  });

  describe('logout', () => {
    it('should revoke refresh tokens and set status offline', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({ affected: 1 });
      mockUsersService.updateStatus.mockResolvedValue(undefined);

      const result = await service.logout('u-1');
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { user_id: 'u-1', is_revoked: false },
        { is_revoked: true },
      );
      expect(mockUsersService.updateStatus).toHaveBeenCalledWith(
        'u-1',
        UserStatus.OFFLINE,
      );
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('forgotPassword', () => {
    it('should return generic success message even if email does not exist', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'unknown@example.com',
      });
      expect(result.message).toContain('password reset link has been sent');
      expect(mockPasswordResetTokenRepository.save).not.toHaveBeenCalled();
    });

    it('should create reset token and return generic message if email exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
      });
      mockPasswordResetTokenRepository.create.mockReturnValue({ id: 'prt-1' });
      mockPasswordResetTokenRepository.save.mockImplementation((e) =>
        Promise.resolve({ id: 'prt-1', ...e }),
      );

      const result = await service.forgotPassword({
        email: 'test@example.com',
      });
      expect(result.message).toContain('password reset link has been sent');
      expect(mockPasswordResetTokenRepository.save).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException if token not found or expired', async () => {
      mockPasswordResetTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-token',
          password: 'NewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully reset password, mark token used, and revoke refresh tokens', async () => {
      const rawToken = 'prt-1.secret123';
      const tokenHash = await argon2.hash(rawToken);

      mockPasswordResetTokenRepository.findOne.mockResolvedValue({
        id: 'prt-1',
        user_id: 'u-1',
        token_hash: tokenHash,
        is_used: false,
        expires_at: new Date(Date.now() + 100000),
      });

      const result = await service.resetPassword({
        token: rawToken,
        password: 'NewPassword123!',
      });

      expect(mockUsersService.updatePasswordHash).toHaveBeenCalled();
      expect(mockPasswordResetTokenRepository.update).toHaveBeenCalledWith(
        'prt-1',
        { is_used: true },
      );
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { user_id: 'u-1', is_revoked: false },
        { is_revoked: true },
      );
      expect(result.message).toBe('Password has been reset successfully');
    });
  });
});
