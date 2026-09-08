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
import { ChannelsService } from './channels.service.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { AddChannelMemberDto } from './dto/add-channel-member.dto.js';
import { QueryChannelsDto } from './dto/query-channels.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { MockAuthGuard } from '../common/guards/mock-auth.guard.js';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('channels')
// @UseGuards(JwtAuthGuard)
@UseGuards(MockAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateChannelDto,
  ) {
    return this.channelsService.create(userId, createDto);
  }

  @Get()
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: QueryChannelsDto,
  ) {
    return this.channelsService.findAll(userId, query);
  }

  @Get(':channelId')
  async findOne(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelsService.findOne(channelId, userId);
  }

  @Post(':channelId/members')
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

  @Delete(':channelId/members/:userId')
  async removeMember(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUser('id') callerId: string,
  ) {
    return this.channelsService.removeMember(channelId, userId, callerId);
  }

  @Patch(':channelId/archive')
  async archive(
    @Param('channelId', new ParseUUIDPipe({ version: '4' })) channelId: string,
    @CurrentUser('id') callerId: string,
  ) {
    return this.channelsService.archive(channelId, callerId);
  }
}
