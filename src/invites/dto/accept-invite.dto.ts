import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInviteDto {
  @ApiProperty({
    example: 'invite-uuid.random-secret',
    description: 'The full invite token from the invite link',
  })
  @IsString({ message: 'token must be a string' })
  @IsNotEmpty({ message: 'token is required' })
  token: string;
}
