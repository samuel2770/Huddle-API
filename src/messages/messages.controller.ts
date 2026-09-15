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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { UpdateMessageDto } from './dto/update-message.dto.js';
import { QueryMessagesDto } from './dto/query-messages.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller(['channels/:channelId/messages', 'api/v1/channels/:channelId/messages'])
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message to a channel' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or channel archived' })
  @ApiResponse({ status: 403, description: 'Not a member of this channel' })
  async create(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateMessageDto,
  ) {
    return this.messagesService.create(channelId, userId, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get paginated messages for a channel' })
  @ApiResponse({ status: 200, description: 'Paginated message list' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async findAll(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') userId: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.messagesService.findAll(channelId, userId, query);
  }

  @Patch(':messageId')
  @ApiOperation({ summary: 'Edit a message (within edit window)' })
  @ApiResponse({ status: 200, description: 'Message updated' })
  @ApiResponse({ status: 403, description: 'Can only edit own messages' })
  @ApiResponse({ status: 400, description: 'Edit window expired or message deleted' })
  async update(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @CurrentUser('id') userId: string,
    @Body() updateDto: UpdateMessageDto,
  ) {
    return this.messagesService.update(channelId, messageId, userId, updateDto);
  }

  @Delete(':messageId')
  @ApiOperation({ summary: 'Soft-delete a message' })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  @ApiResponse({ status: 403, description: 'Can only delete own messages' })
  async remove(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.remove(channelId, messageId, userId);
  }

  @Patch(':messageId/read')
  @ApiOperation({ summary: 'Mark messages as read up to a given message' })
  @ApiResponse({ status: 200, description: 'Read marker updated' })
  async markRead(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('messageId', new ParseUUIDPipe({ version: '4' })) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.markRead(channelId, messageId, userId);
  }
}
