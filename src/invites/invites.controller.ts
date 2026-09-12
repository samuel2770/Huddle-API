import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InvitesService } from './invites.service.js';
import { InviteWorkspaceMemberDto } from '../workspaces/dto/invite-workspace-member.dto.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Invites')
@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post(['workspaces/:workspaceId/invites', 'api/v1/workspaces/:workspaceId/invites'])
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a workspace invite' })
  @ApiResponse({ status: 201, description: 'Invite sent successfully' })
  @ApiResponse({ status: 409, description: 'Pending invite already exists or user already a member' })
  @ApiResponse({ status: 403, description: 'Not a member of this workspace' })
  async create(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' }))
    workspaceId: string,
    @CurrentUser('id') inviterId: string,
    @Body() dto: InviteWorkspaceMemberDto,
  ) {
    return this.invitesService.create(workspaceId, inviterId, dto.email);
  }

  @Post(['invites/accept', 'api/v1/invites/accept'])
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a workspace invite' })
  @ApiResponse({ status: 200, description: 'Invite accepted' })
  @ApiResponse({ status: 400, description: 'Invalid or expired invite' })
  async accept(
    @Body() dto: AcceptInviteDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.invitesService.accept(dto.token, userId);
  }
}
