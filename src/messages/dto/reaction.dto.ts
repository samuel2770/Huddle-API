import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReactionDto {
  @ApiProperty({
    example: '👍',
    description: 'Emoji character or shortcode',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  emoji: string;
}
