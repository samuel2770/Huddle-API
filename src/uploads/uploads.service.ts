import { BadRequestException, Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { PresignRequestDto, UploadPurpose } from './dto/presign-request.dto.js';

const ALLOWED_MIME_TYPES: Record<UploadPurpose, string[]> = {
  [UploadPurpose.AVATAR]: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  [UploadPurpose.WORKSPACE_LOGO]: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  [UploadPurpose.MESSAGE_ATTACHMENT]: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

const MAX_SIZES: Record<UploadPurpose, number> = {
  [UploadPurpose.AVATAR]: 5 * 1024 * 1024, // 5MB
  [UploadPurpose.WORKSPACE_LOGO]: 5 * 1024 * 1024, // 5MB
  [UploadPurpose.MESSAGE_ATTACHMENT]: 50 * 1024 * 1024, // 50MB
};

@Injectable()
export class UploadsService {
  private s3Client: S3Client | null = null;
  private bucket: string;

  constructor() {
    const region = process.env.AWS_REGION ?? 'us-east-1';
    this.bucket = process.env.S3_BUCKET ?? 'huddle-uploads';

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    } else {
      console.warn(
        '[Uploads] S3 credentials not configured — upload endpoints will return stub URLs',
      );
    }
  }

  async generatePresignedUrl(
    userId: string,
    dto: PresignRequestDto,
  ): Promise<{
    uploadUrl: string;
    fileKey: string;
    publicUrl: string;
    expiresIn: number;
  }> {
    // Validate MIME type for the given purpose
    const allowedTypes = ALLOWED_MIME_TYPES[dto.purpose];
    if (!allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `File type "${dto.contentType}" is not allowed for ${dto.purpose}. Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    // Validate file size
    const maxSize = MAX_SIZES[dto.purpose];
    if (dto.fileSize > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum of ${Math.round(maxSize / (1024 * 1024))}MB for ${dto.purpose}`,
      );
    }

    const ext = dto.fileName.split('.').pop() ?? 'bin';
    const uniqueId = crypto.randomUUID();
    const fileKey = `${dto.purpose}/${userId}/${uniqueId}.${ext}`;
    const expiresIn = 3600; // 1 hour

    if (!this.s3Client) {
      // Return stub URL when S3 is not configured
      return {
        uploadUrl: `https://${this.bucket}.s3.amazonaws.com/${fileKey}?stub=true`,
        fileKey,
        publicUrl: `https://${this.bucket}.s3.amazonaws.com/${fileKey}`,
        expiresIn,
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: dto.contentType,
      ContentLength: dto.fileSize,
      Metadata: {
        'uploaded-by': userId,
        purpose: dto.purpose,
        'original-name': dto.fileName,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn,
    });

    return {
      uploadUrl,
      fileKey,
      publicUrl: `https://${this.bucket}.s3.amazonaws.com/${fileKey}`,
      expiresIn,
    };
  }
}
