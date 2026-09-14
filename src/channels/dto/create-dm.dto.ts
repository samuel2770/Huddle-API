import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDmDto {
  @ApiProperty({
    description: 'Workspace ID where the DM takes place',
  })
  @IsUUID(4)
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({
    description: 'User ID of the recipient',
  })
  @IsUUID(4)
  @IsNotEmpty()
  targetUserId: string;
}
