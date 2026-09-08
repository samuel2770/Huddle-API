import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ChannelType } from '../entities/channel.entity.js';

export class QueryChannelsDto {
  @IsUUID(4, { message: 'workspaceId must be a valid UUID' })
  @IsNotEmpty({ message: 'workspaceId is required' })
  workspaceId: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  })
  @IsBoolean({ message: 'includeArchived must be a boolean' })
  includeArchived?: boolean = false;

  @IsOptional()
  @IsEnum(ChannelType, {
    message: 'type must be one of: public, private, dm',
  })
  type?: ChannelType;
}
