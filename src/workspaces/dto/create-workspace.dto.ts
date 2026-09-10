import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({
    example: 'Acme Corp',
    description: 'Workspace display name',
  })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100, { message: 'name cannot exceed 100 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @ApiProperty({
    example: 'acme-corp',
    description: 'URL-friendly workspace slug (lowercase, hyphens, numbers)',
  })
  @IsString({ message: 'slug must be a string' })
  @IsNotEmpty({ message: 'slug is required' })
  @MaxLength(60, { message: 'slug cannot exceed 60 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, numbers, and hyphens (no leading/trailing hyphens)',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'https://example.com/logo.png',
    description: 'Optional workspace logo URL',
  })
  @IsOptional()
  @IsString({ message: 'logoUrl must be a string' })
  logoUrl?: string;
}
