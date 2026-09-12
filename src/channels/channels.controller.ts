import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
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
import { ChannelsService } from './channels.service.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { AddChannelMemberDto } from './dto/add-channel-member.dto.js';
import { AddChannelMembersDto } from './dto/add-channel-members.dto.js';
import { QueryChannelsDto } from './dto/query-channels.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@ApiTags('Channels')
@ApiBearerAuth()
@Controller(['channels', 'api/v1/channels'])
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new channel' })
  @ApiResponse({ status: 201, description: 'Channel created successfully' })
  @ApiResponse({ status: 409, description: 'Channel name already exists in workspace' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateChannelDto,
  ) {
    return this.channelsService.create(userId, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'List channels in a workspace' })
  @ApiResponse({ status: 200, description: 'List of channels' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: QueryChannelsDto,
  ) {
    return this.channelsService.findAll(userId, query);
  }

  @Get(':channelId')
  @ApiOperation({ summary: 'Get channel details' })
  @ApiResponse({ status: 200, description: 'Channel details' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  @ApiResponse({ status: 403, description: 'Not a member of private channel' })
  async findOne(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.findOne(channelId, userId);
  }

  @Post(':channelId/members')
  @ApiOperation({ summary: 'Add a single member to a channel' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  async addMember(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Body() addMemberDto: AddChannelMemberDto,
    @CurrentUser('id') callerId: string,
  ) {
    return this.channelsService.addMember(
      channelId,
      addMemberDto.userId,
      callerId,
    );
  }

  @Post(':channelId/members/bulk')
  @ApiOperation({ summary: 'Add multiple members to a channel (bulk)' })
  @ApiResponse({ status: 201, description: 'Members added successfully' })
  @ApiResponse({ status: 400, description: 'Cannot add to archived channel' })
  async addMembers(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Body() dto: AddChannelMembersDto,
    @CurrentUser('id') callerId: string,
  ) {
    return this.channelsService.addMembers(channelId, dto.userIds, callerId);
  }

  @Delete(':channelId/members/:userId')
  @ApiOperation({ summary: 'Remove a member from a channel' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async removeMember(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUser('id') callerId: string,
  ) {
    return this.channelsService.removeMember(channelId, userId, callerId);
  }

  @Patch(':channelId/archive')
  @ApiOperation({ summary: 'Archive a channel' })
  @ApiResponse({ status: 200, description: 'Channel archived' })
  async archive(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') callerId: string,
  ) {
    return this.channelsService.archive(channelId, callerId);
  }
}
