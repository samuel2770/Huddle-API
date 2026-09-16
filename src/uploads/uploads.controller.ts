import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
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

  @Post('file')
  @ApiOperation({ summary: 'Upload a file or image directly' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'No file provided' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
    }),
  )
  async uploadFile(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.uploadsService.saveLocalFile(userId, file);
  }
}

