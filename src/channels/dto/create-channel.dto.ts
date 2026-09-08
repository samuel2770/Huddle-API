import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ChannelType } from '../entities/channel.entity.js';

export class CreateChannelDto {
  @IsUUID(4, { message: 'workspaceId must be a valid UUID' })
  @IsNotEmpty({ message: 'workspaceId is required' })
  workspaceId: string;

  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(80, { message: 'name cannot exceed 80 characters' })
  name: string;

  @IsOptional()
  @IsEnum(ChannelType, {
    message: 'type must be one of: public, private, dm',
  })
  type?: ChannelType = ChannelType.PUBLIC;
}
