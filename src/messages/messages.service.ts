import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Message } from './entities/message.entity.js';
import { Attachment } from './entities/attachment.entity.js';
import { MessageReaction } from './entities/message-reaction.entity.js';
import { Channel, ChannelType } from '../channels/entities/channel.entity.js';
import { ChannelMember } from '../channels/entities/channel-member.entity.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { UpdateMessageDto } from './dto/update-message.dto.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';
import { ChatGateway } from '../gateway/chat.gateway.js';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectRepository(MessageReaction)
    private readonly reactionRepository: Repository<MessageReaction>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelMember)
    private readonly memberRepository: Repository<ChannelMember>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
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

    const replyToId = dto.getReplyToId();
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
      reply_to_message_id: replyToId,
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
        reactions: { user: true },
      },
    });

    const result = fullMessage || savedMessage;
    // Broadcast real-time message creation via WebSocket
    this.chatGateway.broadcastToChannel(channelId, 'message:new', {
      message: result,
      channelId,
    });

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

    const limit = query.limit ?? 20;

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.attachments', 'attachment')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.reactions', 'reaction')
      .leftJoinAndSelect('reaction.user', 'reactionUser')
      .where('message.channel_id = :channelId', { channelId });

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

    qb.orderBy('message.created_at', 'DESC').take(limit + 1);

    const results = await qb.getMany();

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].created_at.toISOString()
        : null;

    // Mask deleted messages
    const masked = items.map((msg) => {
      if (msg.is_deleted) {
        return {
          ...msg,
          content: null,
          attachments: [],
        };
      }
      return msg;
    });

    return {
      messages: masked,
      nextCursor,
      hasMore,
    };
  }

  async update(
    channelId: string,
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, channel_id: channelId },
      relations: { attachments: true },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    if (message.is_deleted) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    const editWindowMinutes = parseInt(
      process.env.MESSAGE_EDIT_WINDOW_MINUTES ?? '15',
      10,
    );
    const messageAgeMinutes =
      (Date.now() - new Date(message.created_at).getTime()) / (1000 * 60);

    if (messageAgeMinutes > editWindowMinutes) {
      throw new BadRequestException(
        `Message edit window has expired (${editWindowMinutes} minutes)`,
      );
    }

    message.content = dto.content.trim();
    message.is_edited = true;

    const saved = await this.messageRepository.save(message);

    const fullUpdated = await this.messageRepository.findOne({
      where: { id: saved.id },
      relations: {
        attachments: true,
        sender: true,
        reactions: { user: true },
      },
    });

    const result = fullUpdated || saved;
    // Broadcast update via WebSocket
    this.chatGateway.broadcastToChannel(channelId, 'message:updated', {
      message: result,
      channelId,
    });

    return result;
  }

  async remove(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, channel_id: channelId },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    if (!message.is_deleted) {
      message.is_deleted = true;
      message.deleted_at = new Date();
      message.content = null;
      await this.messageRepository.save(message);
    }

    // Broadcast deletion via WebSocket
    this.chatGateway.broadcastToChannel(channelId, 'message:deleted', {
      messageId,
      channelId,
    });

    return {
      success: true,
      message: 'Message deleted successfully',
    };
  }

  async toggleReaction(
    channelId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{ success: boolean; reactions: MessageReaction[] }> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, channel_id: channelId },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    const existing = await this.reactionRepository.findOne({
      where: { message_id: messageId, user_id: userId, emoji },
    });

    if (existing) {
      await this.reactionRepository.remove(existing);
    } else {
      const reaction = this.reactionRepository.create({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
      await this.reactionRepository.save(reaction);
    }

    const reactions = await this.reactionRepository.find({
      where: { message_id: messageId },
      relations: { user: true },
    });

    // Broadcast real-time reaction update to all clients in this channel
    this.chatGateway.broadcastToChannel(channelId, 'message:reaction', {
      messageId,
      channelId,
      reactions,
    });

    return { success: true, reactions };
  }

  async markRead(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<{
    success: boolean;
    lastReadMessageId: string;
    unreadCount: number;
  }> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId, channel_id: channelId },
    });

    if (!message) {
      throw new NotFoundException(
        `Message with ID ${messageId} not found in this channel`,
      );
    }

    const member = await this.memberRepository.findOne({
      where: { channel_id: channelId, user_id: userId },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this channel');
    }

    member.last_read_message_id = messageId;

    // Recalculate unread messages created after this message
    const unreadAfter = await this.messageRepository.count({
      where: {
        channel_id: channelId,
        is_deleted: false,
        created_at: MoreThan(message.created_at),
      },
    });

    member.unread_count = unreadAfter;
    await this.memberRepository.save(member);

    return {
      success: true,
      lastReadMessageId: messageId,
      unreadCount: member.unread_count,
    };
  }
}
