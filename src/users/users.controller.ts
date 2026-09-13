import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller(['users', 'api/v1/users'])
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile returned successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser('id') userId: string) {
    const user = await this.usersService.findByIdOrThrow(userId);
    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatar_url,
      isEmailVerified: user.is_email_verified,
      status: user.status,
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
  })
  @ApiResponse({ status: 409, description: 'Username is already taken' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(userId, dto);
    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatar_url,
      isEmailVerified: user.is_email_verified,
      status: user.status,
    };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by username, full name, or email' })
  @ApiResponse({ status: 200, description: 'Matching users list' })
  async search(@Query('q') query: string) {
    const users = await this.usersService.searchUsers(query || '');
    return users.map((u) => ({
      id: u.id,
      fullName: u.full_name,
      username: u.username,
      email: u.email,
      avatarUrl: u.avatar_url,
      status: u.status,
    }));
  }

  @Get('by-username/:username')
  @ApiOperation({ summary: 'Find a user by unique username' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findByUsername(@Param('username') username: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException(
        `User with username "@${username.replace(/^@/, '')}" not found`,
      );
    }
    return {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatar_url,
      status: user.status,
    };
  }
}

