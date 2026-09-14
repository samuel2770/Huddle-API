import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateMessageDto {
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content is required' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
      : value,
  )
  content: string;
}
