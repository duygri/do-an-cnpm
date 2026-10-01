import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePromotionDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  startDate!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  endDate!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
