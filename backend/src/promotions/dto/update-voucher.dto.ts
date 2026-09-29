import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const POSITIVE_MONEY_PATTERN = /^(?=.*[1-9])(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const transformIntegerInput = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
};

export class UpdateVoucherDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['fixed', 'percentage'])
  type?: 'fixed' | 'percentage';

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  discountValue?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  startDate?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(DATE_PATTERN)
  @IsDateString({ strict: true })
  endDate?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(MONEY_PATTERN)
  minPrice?: string;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  maxDiscount?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(transformIntegerInput)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
