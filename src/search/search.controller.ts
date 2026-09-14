import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Search')
@ApiBearerAuth()
@Controller(['search', 'api/v1/search'])
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search messages and channels in a workspace' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(
    @CurrentUser('id') userId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('q') query: string,
  ) {
    if (!workspaceId) {
      throw new BadRequestException('workspaceId query parameter is required');
    }
    return this.searchService.search(userId, workspaceId, query || '');
  }
}
