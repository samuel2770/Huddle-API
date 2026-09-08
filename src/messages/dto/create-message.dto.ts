import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentDto } from './attachment.dto.js';

export class CreateMessageDto {
  @ValidateIf((o: CreateMessageDto) => !o.attachments || o.attachments.length === 0)
  @IsNotEmpty({ message: 'content is required when attachments are not provided' })
  @IsString({ message: 'content must be a string' })
  content?: string;

  @IsOptional()
  @IsUUID(4, { message: 'reply_to_message_id must be a valid UUID' })
  reply_to_message_id?: string;

  @IsOptional()
  @IsUUID(4, { message: 'replyToMessageId must be a valid UUID' })
  replyToMessageId?: string;

  @IsOptional()
  @IsArray({ message: 'attachments must be an array' })
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  getReplyToId(): string | null {
    return this.reply_to_message_id ?? this.replyToMessageId ?? null;
  }
}
