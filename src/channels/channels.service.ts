import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a channel and auto-adds the creator as the first member.
   * If additional memberIds are provided (from the "Add team members" step),
   * they are added atomically within the same transaction.
   *
   * Per spec: "Channel created successfully" only returns after both the
   * channel row and its member associations are successfully persisted.
   */
  async create(
    userId: string,
    dto: CreateChannelDto,
    memberIds?: string[],
  ): Promise<Channel> {
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

    return this.dataSource.transaction(async (manager) => {
      const channel = manager.create(Channel, {
        workspace_id: dto.workspaceId,
        name: dto.name.trim(),
        type: dto.type ?? ChannelType.PUBLIC,
        created_by: userId,
        is_archived: false,
      });

      const savedChannel = await manager.save(Channel, channel);

      // Always add the creator as the first member
      const creatorMember = manager.create(ChannelMember, {
        channel_id: savedChannel.id,
        user_id: userId,
        unread_count: 0,
        joined_at: new Date(),
      });
      await manager.save(ChannelMember, creatorMember);

      // Add additional members from the "Add team members" step
      if (memberIds && memberIds.length > 0) {
        const uniqueIds = [...new Set(memberIds)].filter(
          (id) => id !== userId,
        );
        if (uniqueIds.length > 0) {
          const additionalMembers = uniqueIds.map((memberId) =>
            manager.create(ChannelMember, {
              channel_id: savedChannel.id,
              user_id: memberId,
              unread_count: 0,
              joined_at: new Date(),
            }),
          );
          await manager.save(ChannelMember, additionalMembers);
        }
      }

      return savedChannel;
    });
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

  /**
   * Bulk add multiple members to a channel. Used by both:
   * - Channel creation flow ("Add team members" step)
   * - In-channel "Add team members" modal
   * 
   * Per spec: "add member should be one backend implementation used by
   * both the channel-creation flow and the in-channel modal"
   */
  async addMembers(
    channelId: string,
    userIds: string[],
    callerId: string,
  ): Promise<{ added: string[]; alreadyMembers: string[] }> {
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
      const isCallerMember = channel.members?.some(
        (m) => m.user_id === callerId,
      );
      const isCallerCreator = channel.created_by === callerId;
      if (!isCallerMember && !isCallerCreator) {
        throw new ForbiddenException(
          'You must be a member to add others to this channel',
        );
      }
    }

    const uniqueIds = [...new Set(userIds)];

    // Find which users are already members
    const existingMembers = await this.memberRepository.find({
      where: {
        channel_id: channelId,
        user_id: In(uniqueIds),
      },
    });
    const existingUserIds = new Set(existingMembers.map((m) => m.user_id));

    const toAdd = uniqueIds.filter((id) => !existingUserIds.has(id));
    const alreadyMembers = uniqueIds.filter((id) => existingUserIds.has(id));

    if (toAdd.length > 0) {
      const newMembers = toAdd.map((userId) =>
        this.memberRepository.create({
          channel_id: channelId,
          user_id: userId,
          unread_count: 0,
          joined_at: new Date(),
        }),
      );
      await this.memberRepository.save(newMembers);
    }

    return { added: toAdd, alreadyMembers };
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
