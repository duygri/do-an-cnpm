import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

function trimImageUrl(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeAltText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() || null : value;
}

export class ProductImageInputDto {
  @Transform(({ value }) => trimImageUrl(value))
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl!: string;

  @Transform(({ value }) => normalizeAltText(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  sortOrder?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isPrimary?: boolean;
}
