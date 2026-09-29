import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normalizeVoucherCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const transformIntegerInput = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
};

export class CreateOrderDetailDto {
  @Transform(transformIntegerInput)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  variantId!: number;

  @Transform(transformIntegerInput)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;
}

export class CreateOrderDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  recipientName!: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 30)
  recipientPhone!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  shippingAddress!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((detail: CreateOrderDetailDto) => detail?.variantId)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDetailDto)
  details!: CreateOrderDetailDto[];

  @Transform(normalizeVoucherCode)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9_-]+$/)
  voucherCode?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  note?: string | null;
}
