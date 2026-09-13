import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User, UserStatus } from './entities/user.entity.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockUserRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockUserRepository.createQueryBuilder.mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(null),
      getMany: vi.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find user by id', async () => {
    const user = { id: 'u-1', email: 'test@example.com' };
    mockUserRepository.findOne.mockResolvedValue(user);

    const result = await service.findById('u-1');
    expect(mockUserRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'u-1' },
    });
    expect(result).toEqual(user);
  });

  it('should throw NotFoundException if user not found in findByIdOrThrow', async () => {
    mockUserRepository.findOne.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('u-999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should find user by email using query builder', async () => {
    const user = { id: 'u-1', email: 'test@example.com' };
    const qb = {
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(user),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findByEmail('test@example.com');
    expect(mockUserRepository.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(qb.where).toHaveBeenCalledWith('LOWER(user.email) = LOWER(:email)', {
      email: 'test@example.com',
    });
    expect(result).toEqual(user);
  });

  it('should create and save user', async () => {
    const data = { email: 'new@example.com', full_name: 'New User' };
    mockUserRepository.create.mockReturnValue(data);
    mockUserRepository.save.mockResolvedValue({ id: 'u-2', ...data });

    const result = await service.create(data);
    expect(mockUserRepository.create).toHaveBeenCalledWith(data);
    expect(mockUserRepository.save).toHaveBeenCalledWith(data);
    expect(result.id).toBe('u-2');
  });

  it('should update user status', async () => {
    mockUserRepository.update.mockResolvedValue({ affected: 1 });

    await service.updateStatus('u-1', UserStatus.ONLINE);
    expect(mockUserRepository.update).toHaveBeenCalledWith('u-1', {
      status: UserStatus.ONLINE,
    });
  });

  it('should update user password hash', async () => {
    mockUserRepository.update.mockResolvedValue({ affected: 1 });

    await service.updatePasswordHash('u-1', 'newhash');
    expect(mockUserRepository.update).toHaveBeenCalledWith('u-1', {
      password_hash: 'newhash',
    });
  });

  it('should find user by username using query builder', async () => {
    const user = { id: 'u-1', username: 'alex' };
    const qb = {
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(user),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findByUsername('alex');
    expect(mockUserRepository.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(qb.where).toHaveBeenCalledWith(
      'LOWER(user.username) = LOWER(:username)',
      { username: 'alex' },
    );
    expect(result).toEqual(user);
  });

  it('should generate a unique username from full name', async () => {
    const qb = {
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(null),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(qb);

    const username = await service.generateUniqueUsername('Jane Doe');
    expect(username).toBe('jane_doe');
  });

  it('should update profile and save user', async () => {
    const existing = {
      id: 'u-1',
      full_name: 'Old Name',
      username: 'oldname',
      avatar_url: null,
    };
    mockUserRepository.findOne.mockResolvedValue(existing);
    mockUserRepository.save.mockImplementation((u: any) => Promise.resolve(u));

    const updated = await service.updateProfile('u-1', {
      fullName: 'New Name',
      username: 'newname',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(updated.full_name).toBe('New Name');
    expect(updated.username).toBe('newname');
    expect(updated.avatar_url).toBe('https://example.com/avatar.png');
  });
});

