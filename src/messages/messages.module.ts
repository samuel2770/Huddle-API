import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesService } from './messages.service.js';
import { MessagesController } from './messages.controller.js';
import { Message } from './entities/message.entity.js';
import { Attachment } from './entities/attachment.entity.js';
import { Channel } from '../channels/entities/channel.entity.js';
import { ChannelMember } from '../channels/entities/channel-member.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Attachment, Channel, ChannelMember]),
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService, TypeOrmModule],
})
export class MessagesModule {}
