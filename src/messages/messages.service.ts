import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity.js';
import { Attachment } from './entities/attachment.entity.js';
import { Channel, ChannelType } from '../channels/entities/channel.entity.js';
import { ChannelMember } from '../channels/entities/channel-member.entity.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { UpdateMessageDto } from './dto/update-message.dto.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';
import { ChatEventsService } from '../gateway/chat-events.service.js';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelMember)
    private readonly memberRepository: Repository<ChannelMember>,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  async create(
    channelId: string,
    userId: string,
    dto: CreateMessageDto,
  ): Promise<Message> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.is_archived) {
      throw new BadRequestException(
        'Cannot send messages to an archived channel',
      );
    }

    let membership = await this.memberRepository.findOne({
      where: {
        channel_id: channelId,
        user_id: userId,
      },
    });

    if (!membership) {
      if (channel.type === ChannelType.PUBLIC) {
        membership = this.memberRepository.create({
          channel_id: channelId,
          user_id: userId,
          unread_count: 0,
          joined_at: new Date(),
        });
        await this.memberRepository.save(membership);
      } else {
        throw new ForbiddenException('You are not a member of this channel');
      }
    }

    const replyToId = dto.getReplyToId ? dto.getReplyToId() : dto.replyToMessageId;
    if (replyToId) {
      const parent = await this.messageRepository.findOne({
        where: { id: replyToId, channel_id: channelId },
      });
      if (!parent) {
        throw new BadRequestException(
          `Parent message with ID ${replyToId} does not exist in this channel`,
        );
      }
    }

    const hasAttachments = dto.attachments && dto.attachments.length > 0;
    const hasContent = dto.content && dto.content.trim().length > 0;

    if (!hasContent && !hasAttachments) {
      throw new BadRequestException(
        'Message must contain either text content or at least one attachment',
      );
    }

    const message = this.messageRepository.create({
      channel_id: channelId,
      sender_id: userId,
      content: hasContent ? dto.content!.trim() : null,
      reply_to_message_id: replyToId ?? null,
      is_edited: false,
      is_deleted: false,
      deleted_at: null,
    });

    const savedMessage = await this.messageRepository.save(message);

    if (hasAttachments && dto.attachments) {
      const attachments = dto.attachments.map((att) =>
        this.attachmentRepository.create({
          message_id: savedMessage.id,
          url: att.url,
          file_type: att.file_type,
          file_size: att.file_size,
          file_name: att.file_name ?? null,
        }),
      );
      savedMessage.attachments =
        await this.attachmentRepository.save(attachments);
    } else {
      savedMessage.attachments = [];
    }

    // Increment unread count for other channel members
    await this.memberRepository
      .createQueryBuilder()
      .update(ChannelMember)
      .set({ unread_count: () => 'unread_count + 1' })
      .where('channel_id = :channelId AND user_id != :userId', {
        channelId,
        userId,
      })
      .execute();

    const fullMessage = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: {
        attachments: true,
        sender: true,
      },
    });

    const result = fullMessage || savedMessage;

    // Step 5: Broadcast real-time message creation via WebSocket room
    // Payload supports both direct message and { message, channelId } structures
    const broadcastPayload = {
      ...result,
      message: result,
      channelId,
      channel_id: channelId,
    };
    this.chatEventsService.broadcastToChannel(channelId, 'message:new', broadcastPayload);

    return result;
  }

  async findAll(
    channelId: string,
    userId: string,
    query: QueryMessagesDto,
  ): Promise<{
    messages: Message[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
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

    const limit = Math.min(query.limit ?? 30, 100);

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.attachments', 'attachment')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.channel_id = :channelId', { channelId });

    // Group channel message visibility:
    // Newly added members should only see recent messages from when they were added, not old history.
    if (channel.type !== ChannelType.DM && channel.created_by !== userId) {
      const membership =
        channel.members?.find((m) => m.user_id === userId) ||
        (await this.memberRepository.findOne({
          where: { channel_id: channelId, user_id: userId },
        }));

      if (membership?.joined_at) {
        // Buffer by 1000ms so the member's addition announcement message is included
        const visibleFrom = new Date(new Date(membership.joined_at).getTime() - 1000);
        qb.andWhere('message.created_at >= :visibleFrom', { visibleFrom });
      }
    }

    if (query.replyToMessageId) {
      qb.andWhere('message.reply_to_message_id = :replyToId', {
        replyToId: query.replyToMessageId,
      });
    }

    if (query.cursor) {
      let cursorDate: Date | null = null;
      if (!isNaN(Date.parse(query.cursor))) {
        cursorDate = new Date(query.cursor);
      } else {
        const cursorMsg = await this.messageRepository.findOne({
          where: { id: query.cursor },
        });
        if (cursorMsg) {
          cursorDate = cursorMsg.created_at;
        }
      }

      if (cursorDate) {
        qb.andWhere('message.created_at < :cursorDate', { cursorDate });
      }
    }

    // Explicit performance index utilized: messages(channel_id, created_at DESC)
    qb.orderBy('message.created_at', 'DESC').take(limit + 1);

    const results = await qb.getMany();

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].created_at.toISOString()
        : null;

    // Return in chronological order for conversation stream
    return {
      messages: items.reverse(),
      nextCursor,
      hasMore,
    };
  }

  async findOne(channelId: string, messageId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, channel_id: channelId },
      relations: {
        attachments: true,
        sender: true,
      },
    });

    if (!message) {
      throw new NotFoundException(
        `Message with ID ${messageId} not found in channel ${channelId}`,
      );
    }

    return message;
  }

  async update(
    channelId: string,
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ): Promise<Message> {
    const message = await this.findOne(channelId, messageId);

    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    if (message.is_deleted) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    const editWindowMinutes = parseInt(
      process.env.MESSAGE_EDIT_WINDOW_MINUTES ?? '15',
      10,
    );
    const windowMs = editWindowMinutes * 60 * 1000;
    const messageAge = Date.now() - new Date(message.created_at).getTime();

    if (messageAge > windowMs) {
      throw new BadRequestException(
        `Messages can only be edited within ${editWindowMinutes} minutes of sending`,
      );
    }

    message.content = dto.content.trim();
    message.is_edited = true;

    const saved = await this.messageRepository.save(message);

    // Broadcast update to channel
    this.chatEventsService.broadcastToChannel(channelId, 'message:updated', {
      message: saved,
      channelId,
    });

    return saved;
  }

  async remove(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; id: string }> {
    const message = await this.findOne(channelId, messageId);

    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    message.is_deleted = true;
    message.deleted_at = new Date();
    message.content = null;

    await this.messageRepository.save(message);

    // Broadcast deletion to channel
    this.chatEventsService.broadcastToChannel(channelId, 'message:deleted', {
      messageId,
      channelId,
    });

    return { success: true, message: 'Message deleted successfully', id: messageId };
  }

  async markRead(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<{ success: boolean; lastReadMessageId: string; unreadCount: number }> {
    const message = await this.findOne(channelId, messageId);

    const member = await this.memberRepository.findOne({
      where: { channel_id: channelId, user_id: userId },
    });

    if (member) {
      member.last_read_message_id = message.id;
      member.unread_count = 0;
      await this.memberRepository.save(member);
    } else {
      await this.memberRepository.update(
        { channel_id: channelId, user_id: userId },
        {
          last_read_message_id: message.id,
          unread_count: 0,
        },
      );
    }

    return { success: true, lastReadMessageId: message.id, unreadCount: 0 };
  }
}
