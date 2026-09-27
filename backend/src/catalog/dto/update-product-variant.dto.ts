import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateProductVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  size?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2, allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(9_999_999_999.99)
  price?: number;
}
