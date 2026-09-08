import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

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
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a channel and auto-add the creator as member', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      const dto = {
        workspaceId: '22222222-2222-2222-2222-222222222222',
        name: 'general',
        type: ChannelType.PUBLIC,
      };

      mockChannelRepo.findOne.mockResolvedValue(null);
      mockChannelRepo.create.mockImplementation((entity) => ({
        ...entity,
        id: 'chan-1',
      }));
      mockChannelRepo.save.mockImplementation((channel) =>
        Promise.resolve(channel),
      );
      mockMemberRepo.create.mockImplementation((entity) => ({
        ...entity,
        id: 'mem-1',
      }));
      mockMemberRepo.save.mockImplementation((member) =>
        Promise.resolve(member),
      );

      const result = await service.create(userId, dto);

      expect(mockChannelRepo.findOne).toHaveBeenCalled();
      expect(mockChannelRepo.save).toHaveBeenCalled();
      expect(mockMemberRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'chan-1',
          user_id: userId,
          unread_count: 0,
        }),
      );
      expect(result.id).toBe('chan-1');
      expect(result.name).toBe('general');
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
      mockMemberRepo.save.mockImplementation((m) => Promise.resolve(m));

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
      mockChannelRepo.save.mockImplementation((c) => Promise.resolve(c));

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
