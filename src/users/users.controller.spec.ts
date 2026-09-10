import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { UserStatus } from './entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findByIdOrThrow: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return user profile without password_hash', async () => {
    mockUsersService.findByIdOrThrow.mockResolvedValue({
      id: 'u-1',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      password_hash: 'secret-hash',
      avatar_url: 'https://example.com/avatar.png',
      is_email_verified: true,
      status: UserStatus.ONLINE,
    });

    const result = await controller.getProfile('u-1');
    expect(mockUsersService.findByIdOrThrow).toHaveBeenCalledWith('u-1');
    expect(result).toEqual({
      id: 'u-1',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      isEmailVerified: true,
      status: UserStatus.ONLINE,
    });
    expect((result as any).password_hash).toBeUndefined();
  });
});
