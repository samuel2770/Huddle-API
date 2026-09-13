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
import { User } from '../users/entities/user.entity.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity.js';
import { Message } from '../messages/entities/message.entity.js';
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

  async resolveUser(identifier: string): Promise<User> {
    const userRepo = this.dataSource.getRepository(User);
    const trimmed = identifier.trim();
    const clean = trimmed.toLowerCase().replace(/^@/, '');

    // Check UUID format
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed,
      );

    if (isUuid) {
      const byId = await userRepo.findOne({ where: { id: trimmed } });
      if (byId) return byId;
    }

    // Lookup by username
    const byUsername = await userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :u', { u: clean })
      .getOne();
    if (byUsername) return byUsername;

    // Lookup by email
    const byEmail = await userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :e', { e: clean })
      .getOne();
    if (byEmail) return byEmail;

    throw new NotFoundException(`User "${identifier}" not found`);
  }

  async getMembers(
    channelId: string,
    userId: string,
  ): Promise<
    {
      id: string;
      userId: string;
      fullName: string;
      username: string;
      email: string;
      avatarUrl: string | null;
      status: string;
      joinedAt: Date;
    }[]
  > {
    await this.findOne(channelId, userId);

    const members = await this.memberRepository.find({
      where: { channel_id: channelId },
      relations: { user: true },
      order: { joined_at: 'ASC' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.user_id,
      fullName: m.user?.full_name || '',
      username: m.user?.username || '',
      email: m.user?.email || '',
      avatarUrl: m.user?.avatar_url || null,
      status: m.user?.status || 'offline',
      joinedAt: m.joined_at,
    }));
  }

  async addMember(
    channelId: string,
    identifierToAdd: string,
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

    const targetUser = await this.resolveUser(identifierToAdd);
    const userIdToAdd = targetUser.id;

    // Automatically ensure target user is a member of the workspace
    const wsMemberRepo = this.dataSource.getRepository(WorkspaceMember);
    const existingWsMember = await wsMemberRepo.findOne({
      where: {
        workspace_id: channel.workspace_id,
        user_id: userIdToAdd,
      },
    });

    if (!existingWsMember) {
      const newWsMember = wsMemberRepo.create({
        workspace_id: channel.workspace_id,
        user_id: userIdToAdd,
        role: WorkspaceRole.MEMBER,
      });
      await wsMemberRepo.save(newWsMember);
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

    const saved = await this.memberRepository.save(member);
    saved.user = targetUser;

    // Post Slack-style announcement message in the channel
    try {
      const userRepo = this.dataSource.getRepository(User);
      const caller = await userRepo.findOne({ where: { id: callerId } });
      const callerHandle = caller?.username ? `@${caller.username}` : (caller?.full_name || 'Someone');
      const targetHandle = targetUser.username ? `@${targetUser.username}` : (targetUser.full_name || 'User');

      const messageRepo = this.dataSource.getRepository(Message);
      const announcement = messageRepo.create({
        channel_id: channelId,
        sender_id: callerId,
        content: `${targetHandle} was added to #${channel.name} by ${callerHandle}.`,
        is_edited: false,
        is_deleted: false,
      });
      await messageRepo.save(announcement);
    } catch {
      // Non-blocking
    }

    return saved;
  }

  /**
   * Bulk add multiple members to a channel. Used by both:
   * - Channel creation flow ("Add team members" step)
   * - In-channel "Add team members" modal
   */
  async addMembers(
    channelId: string,
    identifiers: string[],
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

    // Resolve all identifiers to users
    const resolvedUserIds: string[] = [];
    const wsMemberRepo = this.dataSource.getRepository(WorkspaceMember);

    for (const ident of identifiers) {
      try {
        const user = await this.resolveUser(ident);
        resolvedUserIds.push(user.id);

        // Ensure workspace membership
        const existingWsMember = await wsMemberRepo.findOne({
          where: {
            workspace_id: channel.workspace_id,
            user_id: user.id,
          },
        });
        if (!existingWsMember) {
          const newWsMember = wsMemberRepo.create({
            workspace_id: channel.workspace_id,
            user_id: user.id,
            role: WorkspaceRole.MEMBER,
          });
          await wsMemberRepo.save(newWsMember);
        }
      } catch {
        // Skip unresolved users or handle gracefully
      }
    }

    const uniqueIds = [...new Set(resolvedUserIds)];

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

      // Post announcements for added members
      try {
        const userRepo = this.dataSource.getRepository(User);
        const caller = await userRepo.findOne({ where: { id: callerId } });
        const callerHandle = caller?.username ? `@${caller.username}` : (caller?.full_name || 'Someone');
        const messageRepo = this.dataSource.getRepository(Message);

        for (const addedId of toAdd) {
          const u = await userRepo.findOne({ where: { id: addedId } });
          const targetHandle = u?.username ? `@${u.username}` : (u?.full_name || 'User');
          const announcement = messageRepo.create({
            channel_id: channelId,
            sender_id: callerId,
            content: `${targetHandle} was added to #${channel.name} by ${callerHandle}.`,
            is_edited: false,
            is_deleted: false,
          });
          await messageRepo.save(announcement);
        }
      } catch {
        // Non-blocking
      }
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
