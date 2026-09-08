import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { ChannelType } from './entities/channel.entity.js';

describe('ChannelsController', () => {
  let controller: ChannelsController;

  const mockChannelsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    archive: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        {
          provide: ChannelsService,
          useValue: mockChannelsService,
        },
      ],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call channelsService.create', async () => {
    const dto = {
      workspaceId: '11111111-1111-1111-1111-111111111111',
      name: 'general',
      type: ChannelType.PUBLIC,
    };
    mockChannelsService.create.mockResolvedValue({ id: 'chan-1', ...dto });

    const result = await controller.create('user-1', dto);
    expect(mockChannelsService.create).toHaveBeenCalledWith('user-1', dto);
    expect(result.id).toBe('chan-1');
  });

  it('should call channelsService.findAll', async () => {
    const query = { workspaceId: '11111111-1111-1111-1111-111111111111' };
    mockChannelsService.findAll.mockResolvedValue([{ id: 'chan-1' }]);

    const result = await controller.findAll('user-1', query);
    expect(mockChannelsService.findAll).toHaveBeenCalledWith('user-1', query);
    expect(result).toHaveLength(1);
  });

  it('should call channelsService.findOne', async () => {
    mockChannelsService.findOne.mockResolvedValue({ id: 'chan-1' });

    const result = await controller.findOne('chan-1', 'user-1');
    expect(mockChannelsService.findOne).toHaveBeenCalledWith(
      'chan-1',
      'user-1',
    );
    expect(result.id).toBe('chan-1');
  });

  it('should call channelsService.addMember', async () => {
    mockChannelsService.addMember.mockResolvedValue({
      channel_id: 'chan-1',
      user_id: 'user-2',
    });

    const result = await controller.addMember('chan-1', { userId: 'user-2' }, 'user-1');
    expect(mockChannelsService.addMember).toHaveBeenCalledWith(
      'chan-1',
      'user-2',
      'user-1',
    );
    expect(result.user_id).toBe('user-2');
  });

  it('should call channelsService.removeMember', async () => {
    mockChannelsService.removeMember.mockResolvedValue({
      success: true,
      message: 'Member removed successfully',
    });

    const result = await controller.removeMember('chan-1', 'user-2', 'user-1');
    expect(mockChannelsService.removeMember).toHaveBeenCalledWith(
      'chan-1',
      'user-2',
      'user-1',
    );
    expect(result.success).toBe(true);
  });

  it('should call channelsService.archive', async () => {
    mockChannelsService.archive.mockResolvedValue({
      id: 'chan-1',
      is_archived: true,
    });

    const result = await controller.archive('chan-1', 'user-1');
    expect(mockChannelsService.archive).toHaveBeenCalledWith(
      'chan-1',
      'user-1',
    );
    expect(result.is_archived).toBe(true);
  });
});
