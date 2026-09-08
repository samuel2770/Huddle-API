import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsService } from './channels.service.js';
import { ChannelsController } from './channels.controller.js';
import { Channel } from './entities/channel.entity.js';
import { ChannelMember } from './entities/channel-member.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, ChannelMember])],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService, TypeOrmModule],
})
export class ChannelsModule {}
