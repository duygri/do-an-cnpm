import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN =
  /^(?=0*(?:[1-9]\d{0,21})?(?:\.|$))\d+(?:\.\d{1,2})?(?![\s\S])/;
const POSITIVE_MONEY_PATTERN =
  /^(?=.*[1-9])(?=0*(?:[1-9]\d{0,21})?(?:\.|$))\d+(?:\.\d{1,2})?(?![\s\S])/;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeCode = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
};

const transformIntegerInput = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
};

export class CreateVoucherDto {
  @Transform(normalizeCode)
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9_-]+$/)
  code!: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsIn(['fixed', 'percentage'])
  type!: 'fixed' | 'percentage';

  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  discountValue!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  startDate!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  endDate!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  minPrice!: string;

  @IsOptional()
  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  maxDiscount?: string | null;

  @Transform(transformIntegerInput)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
