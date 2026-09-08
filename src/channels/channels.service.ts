import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType } from './entities/channel.entity.js';
import { ChannelMember } from './entities/channel-member.entity.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { QueryChannelsDto } from './dto/query-channels.dto.js';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelMember)
    private readonly memberRepository: Repository<ChannelMember>,
  ) {}

  async create(userId: string, dto: CreateChannelDto): Promise<Channel> {
    const existing = await this.channelRepository.findOne({
      where: {
        workspace_id: dto.workspaceId,
        name: dto.name.trim(),
      },
    });

    if (existing) {
      throw new ConflictException(
        `Channel with name "${dto.name.trim()}" already exists in this workspace`,
      );
    }

    const channel = this.channelRepository.create({
      workspace_id: dto.workspaceId,
      name: dto.name.trim(),
      type: dto.type ?? ChannelType.PUBLIC,
      created_by: userId,
      is_archived: false,
    });

    const savedChannel = await this.channelRepository.save(channel);

    // Automatically add the creator as the first member of the channel
    const creatorMember = this.memberRepository.create({
      channel_id: savedChannel.id,
      user_id: userId,
      unread_count: 0,
      joined_at: new Date(),
    });
    await this.memberRepository.save(creatorMember);

    return savedChannel;
  }

  async findAll(userId: string, query: QueryChannelsDto): Promise<Channel[]> {
    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .leftJoin(
        'channel.members',
        'member',
        'member.user_id = :userId',
        { userId },
      )
      .where('channel.workspace_id = :workspaceId', {
        workspaceId: query.workspaceId,
      })
      .andWhere(
        '(channel.type = :publicType OR member.id IS NOT NULL OR channel.created_by = :userId)',
        {
          publicType: ChannelType.PUBLIC,
          userId,
        },
      );

    if (!query.includeArchived) {
      qb.andWhere('channel.is_archived = :isArchived', { isArchived: false });
    }

    if (query.type) {
      qb.andWhere('channel.type = :channelType', { channelType: query.type });
    }

    qb.orderBy('channel.created_at', 'ASC');

    return qb.getMany();
  }

  async findOne(channelId: string, userId: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: { members: true },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.type !== ChannelType.PUBLIC) {
      const isMember = channel.members?.some((m) => m.user_id === userId);
      const isCreator = channel.created_by === userId;

      if (!isMember && !isCreator) {
        throw new ForbiddenException(
          'You are not a member of this private channel',
        );
      }
    }

    return channel;
  }

  async addMember(
    channelId: string,
    userIdToAdd: string,
    callerId: string,
  ): Promise<ChannelMember> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: { members: true },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.is_archived) {
      throw new BadRequestException(
        'Cannot add members to an archived channel',
      );
    }

    if (channel.type !== ChannelType.PUBLIC) {
      const isCallerMember = channel.members?.some((m) => m.user_id === callerId);
      const isCallerCreator = channel.created_by === callerId;
      if (!isCallerMember && !isCallerCreator) {
        throw new ForbiddenException(
          'You must be a member to add others to this channel',
        );
      }
    }

    const existing = await this.memberRepository.findOne({
      where: {
        channel_id: channelId,
        user_id: userIdToAdd,
      },
    });

    if (existing) {
      throw new ConflictException('User is already a member of this channel');
    }

    const member = this.memberRepository.create({
      channel_id: channelId,
      user_id: userIdToAdd,
      unread_count: 0,
      joined_at: new Date(),
    });

    return this.memberRepository.save(member);
  }

  async removeMember(
    channelId: string,
    userIdToRemove: string,
    callerId: string,
  ): Promise<{ success: boolean; message: string }> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    const membership = await this.memberRepository.findOne({
      where: {
        channel_id: channelId,
        user_id: userIdToRemove,
      },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this channel');
    }

    const isSelf = callerId === userIdToRemove;
    const isCreator = channel.created_by === callerId;

    if (!isSelf && !isCreator) {
      throw new ForbiddenException(
        'You do not have permission to remove this member from the channel',
      );
    }

    await this.memberRepository.remove(membership);

    return {
      success: true,
      message: 'Member removed successfully',
    };
  }

  async archive(channelId: string, callerId: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: { members: true },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.is_archived) {
      throw new BadRequestException('Channel is already archived');
    }

    const isMember = channel.members?.some((m) => m.user_id === callerId);
    const isCreator = channel.created_by === callerId;

    if (!isMember && !isCreator) {
      throw new ForbiddenException(
        'You do not have permission to archive this channel',
      );
    }

    channel.is_archived = true;
    return this.channelRepository.save(channel);
  }
}
