import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { Message } from './entities/message.entity.js';
import { Attachment } from './entities/attachment.entity.js';
import { Channel, ChannelType } from '../channels/entities/channel.entity.js';
import { ChannelMember } from '../channels/entities/channel-member.entity.js';
import { CreateMessageDto } from './dto/create-message.dto.js';

describe('MessagesService', () => {
  let service: MessagesService;

  const mockMessageRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    count: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const mockAttachmentRepo = {
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockChannelRepo = {
    findOne: vi.fn(),
  };

  const mockMemberRepo = {
    findOne: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: getRepositoryToken(Message),
          useValue: mockMessageRepo,
        },
        {
          provide: getRepositoryToken(Attachment),
          useValue: mockAttachmentRepo,
        },
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

    service = module.get<MessagesService>(MessagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const channelId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-2222-2222-222222222222';

    it('should create message and increment unread count for other members', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        is_archived: false,
      });
      mockMemberRepo.findOne.mockResolvedValue({
        channel_id: channelId,
        user_id: userId,
      });

      const qbUpdateMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 2 }),
      };
      mockMemberRepo.createQueryBuilder.mockReturnValue(qbUpdateMock);

      mockMessageRepo.create.mockImplementation((dto) => ({
        ...dto,
        id: 'msg-1',
      }));
      mockMessageRepo.save.mockImplementation((m) => Promise.resolve(m));

      const dto = new CreateMessageDto();
      dto.content = 'Hello world!';

      const result = await service.create(channelId, userId, dto);

      expect(mockMessageRepo.save).toHaveBeenCalled();
      expect(result.content).toBe('Hello world!');
      expect(qbUpdateMock.execute).toHaveBeenCalled();
    });

    it('should create message with attachments only', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        is_archived: false,
      });
      mockMemberRepo.findOne.mockResolvedValue({
        channel_id: channelId,
        user_id: userId,
      });

      const qbUpdateMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 1 }),
      };
      mockMemberRepo.createQueryBuilder.mockReturnValue(qbUpdateMock);

      mockMessageRepo.create.mockImplementation((dto) => ({
        ...dto,
        id: 'msg-2',
      }));
      mockMessageRepo.save.mockImplementation((m) => Promise.resolve(m));
      mockAttachmentRepo.create.mockImplementation((att) => ({
        ...att,
        id: 'att-1',
      }));
      mockAttachmentRepo.save.mockResolvedValue([
        { id: 'att-1', url: 'https://example.com/file.png' },
      ]);

      const dto = new CreateMessageDto();
      dto.attachments = [
        {
          url: 'https://example.com/file.png',
          file_type: 'image/png',
          file_size: 1024,
        },
      ];

      const result = await service.create(channelId, userId, dto);

      expect(mockAttachmentRepo.save).toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.attachments).toHaveLength(1);
    });

    it('should throw BadRequestException if neither content nor attachments given', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        is_archived: false,
      });
      mockMemberRepo.findOne.mockResolvedValue({
        channel_id: channelId,
        user_id: userId,
      });

      const dto = new CreateMessageDto();

      await expect(service.create(channelId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if channel is archived', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        is_archived: true,
      });

      const dto = new CreateMessageDto();
      dto.content = 'test';

      await expect(service.create(channelId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException if user is not member of channel', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        is_archived: false,
      });
      mockMemberRepo.findOne.mockResolvedValue(null);

      const dto = new CreateMessageDto();
      dto.content = 'test';

      await expect(service.create(channelId, userId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should edit message within time window', async () => {
      const message = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'user-1',
        content: 'Old text',
        created_at: new Date(),
        is_edited: false,
        is_deleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValue(message);
      mockMessageRepo.save.mockImplementation((m) => Promise.resolve(m));

      const result = await service.update('chan-1', 'msg-1', 'user-1', {
        content: 'New edited text',
      });

      expect(result.content).toBe('New edited text');
      expect(result.is_edited).toBe(true);
    });

    it('should throw ForbiddenException if user is not the message sender', async () => {
      const message = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'author-id',
        created_at: new Date(),
        is_deleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValue(message);

      await expect(
        service.update('chan-1', 'msg-1', 'other-user', { content: 'hack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if message is already deleted', async () => {
      const message = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'user-1',
        created_at: new Date(),
        is_deleted: true,
      };
      mockMessageRepo.findOne.mockResolvedValue(message);

      await expect(
        service.update('chan-1', 'msg-1', 'user-1', { content: 'edit' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if edit window has expired', async () => {
      const pastDate = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago
      const message = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'user-1',
        created_at: pastDate,
        is_deleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValue(message);

      await expect(
        service.update('chan-1', 'msg-1', 'user-1', { content: 'too late' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should soft delete message by setting is_deleted=true and content=null', async () => {
      const message = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'user-1',
        content: 'Secret',
        is_deleted: false,
        deleted_at: null,
      };
      mockMessageRepo.findOne.mockResolvedValue(message);
      mockMessageRepo.save.mockImplementation((m) => Promise.resolve(m));

      const result = await service.remove('chan-1', 'msg-1', 'user-1');

      expect(result.success).toBe(true);
      expect(message.is_deleted).toBe(true);
      expect(message.content).toBeNull();
      expect(message.deleted_at).toBeDefined();
    });

    it('should throw ForbiddenException if another user attempts deletion', async () => {
      const message = {
        id: 'msg-1',
        channel_id: 'chan-1',
        sender_id: 'user-1',
        is_deleted: false,
      };
      mockMessageRepo.findOne.mockResolvedValue(message);

      await expect(
        service.remove('chan-1', 'msg-1', 'different-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markRead', () => {
    it('should update last_read_message_id and unread_count', async () => {
      const message = {
        id: 'msg-5',
        channel_id: 'chan-1',
        created_at: new Date(),
      };
      const member = {
        channel_id: 'chan-1',
        user_id: 'user-1',
        last_read_message_id: null,
        unread_count: 5,
      };

      mockMessageRepo.findOne.mockResolvedValue(message);
      mockMemberRepo.findOne.mockResolvedValue(member);
      mockMessageRepo.count.mockResolvedValue(0);
      mockMemberRepo.save.mockImplementation((m) => Promise.resolve(m));

      const result = await service.markRead('chan-1', 'msg-5', 'user-1');

      expect(result.success).toBe(true);
      expect(result.lastReadMessageId).toBe('msg-5');
      expect(result.unreadCount).toBe(0);
      expect(member.last_read_message_id).toBe('msg-5');
      expect(member.unread_count).toBe(0);
    });
  });
});
