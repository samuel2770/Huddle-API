import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChannelMembershipGuard } from './channel-membership.guard.js';

describe('ChannelMembershipGuard', () => {
  let guard: ChannelMembershipGuard;

  const mockChannelRepo = {
    findOne: vi.fn(),
  };

  const mockMemberRepo = {
    findOne: vi.fn(),
  };

  const mockDataSource = {
    getRepository: vi.fn((entity) => {
      if (entity.name === 'Channel') return mockChannelRepo;
      return mockMemberRepo;
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new ChannelMembershipGuard(mockDataSource as any);
  });

  it('should allow access if user is a member of the channel', async () => {
    const request = {
      user: { id: 'user-1' },
      params: { channelId: 'chan-1' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1' });
    mockMemberRepo.findOne.mockResolvedValue({
      channel_id: 'chan-1',
      user_id: 'user-1',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if user is not a member', async () => {
    const request = {
      user: { id: 'intruder-1' },
      params: { channelId: 'chan-1' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1' });
    mockMemberRepo.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw NotFoundException if channel is not found', async () => {
    const request = {
      user: { id: 'user-1' },
      params: { channelId: 'chan-99' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;

    mockChannelRepo.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(
      NotFoundException,
    );
  });
});
