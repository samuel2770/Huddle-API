import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UploadsService } from './uploads.service.js';
import { PresignRequestDto } from './dto/presign-request.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Generate a pre-signed S3 upload URL' })
  @ApiResponse({ status: 201, description: 'Pre-signed URL generated' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async getPresignedUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: PresignRequestDto,
  ) {
    return this.uploadsService.generatePresignedUrl(userId, dto);
  }
}
