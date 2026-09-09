import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CustomThrottlerGuard } from '../common/guards/throttler.guard.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    signup: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call authService.signup', async () => {
    const dto = {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Password123!',
    };
    mockAuthService.signup.mockResolvedValue({ id: 'u-1', ...dto });

    const result = await controller.signup(dto);
    expect(mockAuthService.signup).toHaveBeenCalledWith(dto);
    expect(result.id).toBe('u-1');
  });

  it('should call authService.login', async () => {
    const dto = { email: 'jane@example.com', password: 'Password123!' };
    mockAuthService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const result = await controller.login(dto);
    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    expect(result.accessToken).toBe('access-token');
  });

  it('should call authService.refresh', async () => {
    const dto = { refreshToken: 'refresh-token' };
    mockAuthService.refresh.mockResolvedValue({ accessToken: 'new-token' });

    const result = await controller.refresh(dto);
    expect(mockAuthService.refresh).toHaveBeenCalledWith(dto);
    expect(result.accessToken).toBe('new-token');
  });

  it('should call authService.logout', async () => {
    mockAuthService.logout.mockResolvedValue({
      message: 'Logged out successfully',
    });

    const result = await controller.logout('user-1');
    expect(mockAuthService.logout).toHaveBeenCalledWith('user-1');
    expect(result.message).toBe('Logged out successfully');
  });

  it('should call authService.forgotPassword', async () => {
    const dto = { email: 'jane@example.com' };
    mockAuthService.forgotPassword.mockResolvedValue({
      message: 'Instructions sent',
    });

    const result = await controller.forgotPassword(dto);
    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    expect(result.message).toBe('Instructions sent');
  });

  it('should call authService.resetPassword', async () => {
    const dto = { token: 'reset-token', password: 'NewPassword123!' };
    mockAuthService.resetPassword.mockResolvedValue({
      message: 'Password reset successfully',
    });

    const result = await controller.resetPassword(dto);
    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    expect(result.message).toBe('Password reset successfully');
  });
});
