import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../messages/entities/message.entity.js';
import { Channel } from '../channels/entities/channel.entity.js';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async search(
    userId: string,
    workspaceId: string,
    query: string,
  ): Promise<{
    channels: Channel[];
    messages: Message[];
  }> {
    const q = (query || '').trim();
    if (!q) {
      return { channels: [], messages: [] };
    }

    // 1. Search channels in workspace
    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .leftJoin('channel.members', 'member', 'member.user_id = :userId', { userId })
      .where('channel.workspace_id = :workspaceId', { workspaceId })
      .andWhere('channel.is_archived = false')
      .andWhere(
        '(channel.name ILIKE :q OR channel.description ILIKE :q OR channel.topic ILIKE :q)',
        { q: `%${q}%` },
      )
      .andWhere('(channel.type = :pubType OR member.id IS NOT NULL)', {
        pubType: 'public',
      })
      .take(15)
      .getMany();

    // 2. Search messages in workspace
    const messages = await this.messageRepository
      .createQueryBuilder('message')
      .innerJoinAndSelect('message.channel', 'channel')
      .innerJoinAndSelect('message.sender', 'sender')
      .leftJoin('channel.members', 'member', 'member.user_id = :userId', { userId })
      .where('channel.workspace_id = :workspaceId', { workspaceId })
      .andWhere('message.is_deleted = false')
      .andWhere('message.content ILIKE :q', { q: `%${q}%` })
      .andWhere('(channel.type = :pubType OR member.id IS NOT NULL)', {
        pubType: 'public',
      })
      .orderBy('message.created_at', 'DESC')
      .take(25)
      .getMany();

    return {
      channels,
      messages,
    };
  }
}
