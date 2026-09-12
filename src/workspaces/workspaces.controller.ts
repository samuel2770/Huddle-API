import {
  Controller,
  Get,
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
import { WorkspacesService } from './workspaces.service.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller(['workspaces', 'api/v1/workspaces'])
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created successfully' })
  @ApiResponse({ status: 409, description: 'Workspace slug already taken' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces the user belongs to' })
  @ApiResponse({ status: 200, description: 'List of user workspaces' })
  async findAll(@CurrentUser('id') userId: string) {
    return this.workspacesService.findAll(userId);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get workspace details' })
  @ApiResponse({ status: 200, description: 'Workspace details' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({ status: 403, description: 'Not a member of this workspace' })
  async findOne(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' }))
    workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.workspacesService.findOne(workspaceId, userId);
  }

  @Get(':workspaceId/members')
  @ApiOperation({
    summary: 'List workspace members with online/offline status',
  })
  @ApiResponse({ status: 200, description: 'List of workspace members' })
  @ApiResponse({ status: 403, description: 'Not a member of this workspace' })
  async getMembers(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' }))
    workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.workspacesService.getMembers(workspaceId, userId);
  }

  @Post(':identifier/join')
  @ApiOperation({ summary: 'Join a workspace by ID or slug' })
  @ApiResponse({ status: 200, description: 'Successfully joined workspace' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async join(
    @Param('identifier') identifier: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.workspacesService.join(identifier, userId);
  }
}
