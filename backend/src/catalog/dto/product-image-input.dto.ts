import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProductImageInputDto {
  @IsString()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_tld: false,
  })
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
