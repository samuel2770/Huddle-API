import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddChannelMemberDto {
  @ApiPropertyOptional({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'User ID to add to the channel',
  })
  @IsOptional()
  @IsUUID(4, { message: 'userId must be a valid UUID' })
  userId?: string;

  @ApiPropertyOptional({
    example: 'grace_abdul',
    description: 'Unique username of the user to add to the channel',
  })
  @IsOptional()
  @IsString({ message: 'username must be a string' })
  username?: string;
}
