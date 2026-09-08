import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AttachmentDto {
  @IsString({ message: 'url must be a string' })
  @IsNotEmpty({ message: 'url is required' })
  url: string;

  @IsString({ message: 'file_type must be a string' })
  @IsNotEmpty({ message: 'file_type is required' })
  file_type: string;

  @IsInt({ message: 'file_size must be an integer' })
  @Min(0, { message: 'file_size must be greater than or equal to 0' })
  file_size: number;

  @IsOptional()
  @IsString({ message: 'file_name must be a string' })
  file_name?: string;
}
