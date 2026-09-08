import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChannelMember } from '../../channels/entities/channel-member.entity.js';
import { Channel } from '../../channels/entities/channel.entity.js';

@Injectable()
export class ChannelMembershipGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const channelId = request.params?.channelId ?? request.params?.id;

    if (!userId) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (!channelId) {
      return true;
    }

    const channelRepo = this.dataSource.getRepository(Channel);
    const channel = await channelRepo.findOne({ where: { id: channelId } });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    // Public channels might be readable, but for membership guard checks:
    const memberRepo = this.dataSource.getRepository(ChannelMember);
    const membership = await memberRepo.findOne({
      where: {
        channel_id: channelId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this channel');
    }

    // Attach channel and membership to request for downstream handlers if needed
    request.channel = channel;
    request.channelMembership = membership;

    return true;
  }
}
