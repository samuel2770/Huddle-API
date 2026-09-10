import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UploadPurpose {
  AVATAR = 'avatar',
  WORKSPACE_LOGO = 'workspace_logo',
  MESSAGE_ATTACHMENT = 'message_attachment',
}

export class PresignRequestDto {
  @ApiProperty({
    example: 'photo.jpg',
    description: 'Original filename',
  })
  @IsString({ message: 'fileName must be a string' })
  @IsNotEmpty({ message: 'fileName is required' })
  fileName: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME type of the file',
  })
  @IsString({ message: 'contentType must be a string' })
  @IsNotEmpty({ message: 'contentType is required' })
  contentType: string;

  @ApiProperty({
    example: 102400,
    description: 'File size in bytes',
  })
  @IsInt({ message: 'fileSize must be an integer' })
  @Min(1, { message: 'fileSize must be at least 1 byte' })
  @Max(50 * 1024 * 1024, { message: 'fileSize cannot exceed 50MB' })
  fileSize: number;

  @ApiProperty({
    example: 'message_attachment',
    enum: UploadPurpose,
    description: 'What the upload is for',
  })
  @IsEnum(UploadPurpose, {
    message: 'purpose must be one of: avatar, workspace_logo, message_attachment',
  })
  purpose: UploadPurpose;
}
