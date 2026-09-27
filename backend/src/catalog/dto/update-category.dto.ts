import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateCategoryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
