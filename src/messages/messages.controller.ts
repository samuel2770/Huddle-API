import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { UpdateMessageDto } from './dto/update-message.dto.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { MockAuthGuard } from '../common/guards/mock-auth.guard.js';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('channels/:channelId/messages')
// @UseGuards(JwtAuthGuard)
@UseGuards(MockAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async create(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateMessageDto,
  ) {
    return this.messagesService.create(channelId, userId, createDto);
  }

  @Get()
  async findAll(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') userId: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.messagesService.findAll(channelId, userId, query);
  }

  @Patch(':messageId')
  async update(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @CurrentUser('id') userId: string,
    @Body() updateDto: UpdateMessageDto,
  ) {
    return this.messagesService.update(channelId, messageId, userId, updateDto);
  }

  @Delete(':messageId')
  async remove(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.remove(channelId, messageId, userId);
  }

  @Patch(':messageId/read')
  async markRead(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.markRead(channelId, messageId, userId);
  }
}
