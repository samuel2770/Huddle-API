import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway.js';
import { MessagesModule } from '../messages/messages.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChannelMember } from '../channels/entities/channel-member.entity.js';

@Module({
  imports: [
    MessagesModule,
    AuthModule,
    TypeOrmModule.forFeature([ChannelMember]),
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewayModule {}
