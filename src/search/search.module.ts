import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';
import { Message } from '../messages/entities/message.entity.js';
import { Channel } from '../channels/entities/channel.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Channel])],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
