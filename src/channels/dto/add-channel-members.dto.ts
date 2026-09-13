import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddChannelMembersDto {
  @ApiPropertyOptional({
    example: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    description: 'Array of user IDs to add to the channel',
  })
  @IsOptional()
  @IsArray({ message: 'userIds must be an array' })
  @IsUUID(4, { each: true, message: 'Each userId must be a valid UUID' })
  userIds?: string[];

  @ApiPropertyOptional({
    example: ['grace_abdul', 'stephenaro3'],
    description: 'Array of unique usernames to add to the channel',
  })
  @IsOptional()
  @IsArray({ message: 'usernames must be an array' })
  @IsString({ each: true, message: 'Each username must be a string' })
  usernames?: string[];
}
