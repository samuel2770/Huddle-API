import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { UpdateMessageDto } from './dto/update-message.dto.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';

describe('MessagesController', () => {
  let controller: MessagesController;

  const mockMessagesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    markRead: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        {
          provide: MessagesService,
          useValue: mockMessagesService,
        },
      ],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call messagesService.create', async () => {
    const dto = new CreateMessageDto();
    dto.content = 'Hello';
    mockMessagesService.create.mockResolvedValue({ id: 'msg-1', content: 'Hello' });

    const result = await controller.create('chan-1', 'user-1', dto);
    expect(mockMessagesService.create).toHaveBeenCalledWith('chan-1', 'user-1', dto);
    expect(result.id).toBe('msg-1');
  });

  it('should call messagesService.findAll', async () => {
    const query = new QueryMessagesDto();
    mockMessagesService.findAll.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const result = await controller.findAll('chan-1', 'user-1', query);
    expect(mockMessagesService.findAll).toHaveBeenCalledWith('chan-1', 'user-1', query);
    expect(result.messages).toEqual([]);
  });

  it('should call messagesService.update', async () => {
    const dto = new UpdateMessageDto();
    dto.content = 'Edited text';
    mockMessagesService.update.mockResolvedValue({ id: 'msg-1', content: 'Edited text' });

    const result = await controller.update('chan-1', 'msg-1', 'user-1', dto);
    expect(mockMessagesService.update).toHaveBeenCalledWith('chan-1', 'msg-1', 'user-1', dto);
    expect(result.content).toBe('Edited text');
  });

  it('should call messagesService.remove', async () => {
    mockMessagesService.remove.mockResolvedValue({
      success: true,
      message: 'Message deleted successfully',
    });

    const result = await controller.remove('chan-1', 'msg-1', 'user-1');
    expect(mockMessagesService.remove).toHaveBeenCalledWith('chan-1', 'msg-1', 'user-1');
    expect(result.success).toBe(true);
  });

  it('should call messagesService.markRead', async () => {
    mockMessagesService.markRead.mockResolvedValue({
      success: true,
      lastReadMessageId: 'msg-1',
      unreadCount: 0,
    });

    const result = await controller.markRead('chan-1', 'msg-1', 'user-1');
    expect(mockMessagesService.markRead).toHaveBeenCalledWith('chan-1', 'msg-1', 'user-1');
    expect(result.success).toBe(true);
  });
});
