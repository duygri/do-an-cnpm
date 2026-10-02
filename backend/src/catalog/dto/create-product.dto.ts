import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ProductImageInputDto } from './product-image-input.dto';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/\S/)
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  categoryId!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];
}
