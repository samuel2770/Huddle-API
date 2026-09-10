import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddChannelMembersDto {
  @ApiProperty({
    example: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    description: 'Array of user IDs to add to the channel',
  })
  @IsArray({ message: 'userIds must be an array' })
  @ArrayNotEmpty({ message: 'userIds must not be empty' })
  @IsUUID(4, { each: true, message: 'Each userId must be a valid UUID' })
  userIds: string[];
}
