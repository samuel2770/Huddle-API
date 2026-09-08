import { IsNotEmpty, IsUUID } from 'class-validator';

export class AddChannelMemberDto {
  @IsUUID(4, { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'userId is required' })
  userId: string;
}
