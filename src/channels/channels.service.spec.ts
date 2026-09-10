import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { Channel, ChannelType } from './entities/channel.entity.js';
import { ChannelMember } from './entities/channel-member.entity.js';

describe('ChannelsService', () => {
  let service: ChannelsService;

  const mockChannelRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const mockMemberRepo = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };

  // Mock DataSource.transaction — executes the callback immediately with a mock manager
  const mockManager = {
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockDataSource = {
    transaction: vi.fn(async (cb: (manager: any) => Promise<any>) => {
      return cb(mockManager);
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset manager mocks
    mockManager.create.mockImplementation((_entity: any, data: any) => ({
      ...data,
      id: data.id ?? `mock-${Math.random().toString(36).slice(2, 8)}`,
    }));
    mockManager.save.mockImplementation((_entity: any, data: any) =>
      Promise.resolve(data),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: getRepositoryToken(Channel),
          useValue: mockChannelRepo,
        },
        {
          provide: getRepositoryToken(ChannelMember),
          useValue: mockMemberRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a channel and auto-add the creator as member within a transaction', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      const dto = {
        workspaceId: '22222222-2222-2222-2222-222222222222',
        name: 'general',
        type: ChannelType.PUBLIC,
      };

      mockChannelRepo.findOne.mockResolvedValue(null);

      await service.create(userId, dto);

      expect(mockChannelRepo.findOne).toHaveBeenCalled();
      expect(mockDataSource.transaction).toHaveBeenCalled();
      // Manager.create should be called for channel + creator member
      expect(mockManager.create).toHaveBeenCalledTimes(2);
      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('should create channel with additional members atomically', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      const dto = {
        workspaceId: '22222222-2222-2222-2222-222222222222',
        name: 'team',
        type: ChannelType.PRIVATE,
      };
      const memberIds = [
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
      ];

      mockChannelRepo.findOne.mockResolvedValue(null);

      await service.create(userId, dto, memberIds);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      // channel + creator + 2 additional members (bulk save counts as 1 call)
      expect(mockManager.save).toHaveBeenCalledTimes(3);
    });

    it('should deduplicate memberIds and exclude creator from additional members', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      const dto = {
        workspaceId: '22222222-2222-2222-2222-222222222222',
        name: 'dedup-test',
      };
      // Include creator's ID and a duplicate
      const memberIds = [
        userId,
        '33333333-3333-3333-3333-333333333333',
        '33333333-3333-3333-3333-333333333333',
      ];

      mockChannelRepo.findOne.mockResolvedValue(null);

      await service.create(userId, dto, memberIds);

      // Only 1 additional member (creator filtered out, duplicate removed)
      // save calls: channel, creator member, [1 additional member]
      expect(mockManager.save).toHaveBeenCalledTimes(3);
    });

    it('should throw ConflictException if channel name exists in workspace', async () => {
      mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1' });

      await expect(
        service.create('u-1', {
          workspaceId: 'ws-1',
          name: 'general',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return public channel for any user', async () => {
      const channel = {
        id: 'chan-1',
        type: ChannelType.PUBLIC,
        created_by: 'creator-id',
        members: [],
      };
      mockChannelRepo.findOne.mockResolvedValue(channel);

      const result = await service.findOne('chan-1', 'other-user');
      expect(result).toBe(channel);
    });

    it('should throw NotFoundException if channel not found', async () => {
      mockChannelRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('chan-99', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow member access to private channel', async () => {
      const channel = {
        id: 'chan-priv',
        type: ChannelType.PRIVATE,
        created_by: 'creator-id',
        members: [{ user_id: 'member-id' }],
      };
      mockChannelRepo.findOne.mockResolvedValue(channel);

      const result = await service.findOne('chan-priv', 'member-id');
      expect(result).toBe(channel);
    });

    it('should throw ForbiddenException if non-member accesses private channel', async () => {
      const channel = {
        id: 'chan-priv',
        type: ChannelType.PRIVATE,
        created_by: 'creator-id',
        members: [{ user_id: 'member-id' }],
      };
      mockChannelRepo.findOne.mockResolvedValue(channel);

      await expect(
        service.findOne('chan-priv', 'intruder-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMember', () => {
    it('should add member to active channel', async () => {
      const channel = {
        id: 'chan-1',
        type: ChannelType.PUBLIC,
        is_archived: false,
        members: [],
      };
      mockChannelRepo.findOne.mockResolvedValue(channel);
      mockMemberRepo.findOne.mockResolvedValue(null);
      mockMemberRepo.create.mockReturnValue({
        channel_id: 'chan-1',
        user_id: 'new-user',
        unread_count: 0,
      });
      mockMemberRepo.save.mockImplementation((m: any) => Promise.resolve(m));

      const result = await service.addMember('chan-1', 'new-user', 'caller-id');
      expect(result.user_id).toBe('new-user');
    });

    it('should throw BadRequestException when adding to archived channel', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        is_archived: true,
      });

      await expect(
        service.addMember('chan-1', 'new-user', 'caller-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user is already a member', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        is_archived: false,
        type: ChannelType.PUBLIC,
      });
      mockMemberRepo.findOne.mockResolvedValue({ id: 'existing-mem' });

      await expect(
        service.addMember('chan-1', 'existing-user', 'caller-id'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addMembers (bulk)', () => {
    it('should add multiple members and report already-existing ones', async () => {
      const channel = {
        id: 'chan-1',
        type: ChannelType.PUBLIC,
        is_archived: false,
        members: [],
      };
      mockChannelRepo.findOne.mockResolvedValue(channel);
      mockMemberRepo.find.mockResolvedValue([
        { user_id: 'existing-user', channel_id: 'chan-1' },
      ]);
      mockMemberRepo.create.mockImplementation((data: any) => data);
      mockMemberRepo.save.mockResolvedValue([]);

      const result = await service.addMembers(
        'chan-1',
        ['new-user-1', 'existing-user', 'new-user-2'],
        'caller-id',
      );

      expect(result.added).toEqual(['new-user-1', 'new-user-2']);
      expect(result.alreadyMembers).toEqual(['existing-user']);
    });

    it('should throw BadRequestException when bulk adding to archived channel', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        is_archived: true,
      });

      await expect(
        service.addMembers('chan-1', ['user-1'], 'caller-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('should allow user to remove themselves', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        created_by: 'owner',
      });
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        user_id: 'user-1',
      });
      mockMemberRepo.remove.mockResolvedValue({});

      const result = await service.removeMember('chan-1', 'user-1', 'user-1');
      expect(result.success).toBe(true);
      expect(mockMemberRepo.remove).toHaveBeenCalled();
    });

    it('should allow channel creator to remove another user', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        created_by: 'owner-id',
      });
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-2',
        user_id: 'other-user',
      });
      mockMemberRepo.remove.mockResolvedValue({});

      const result = await service.removeMember(
        'chan-1',
        'other-user',
        'owner-id',
      );
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException if unauthorized user tries to remove another', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        created_by: 'owner-id',
      });
      mockMemberRepo.findOne.mockResolvedValue({
        id: 'mem-2',
        user_id: 'target-user',
      });

      await expect(
        service.removeMember('chan-1', 'target-user', 'random-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('archive', () => {
    it('should archive channel when called by member or creator', async () => {
      const channel = {
        id: 'chan-1',
        is_archived: false,
        created_by: 'creator-id',
        members: [{ user_id: 'creator-id' }],
      };
      mockChannelRepo.findOne.mockResolvedValue(channel);
      mockChannelRepo.save.mockImplementation((c: any) => Promise.resolve(c));

      const result = await service.archive('chan-1', 'creator-id');
      expect(result.is_archived).toBe(true);
    });

    it('should throw BadRequestException if already archived', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        is_archived: true,
      });

      await expect(service.archive('chan-1', 'creator-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
