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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateOrderDetailDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  variantId!: number;

  @Type(() => Number)
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

  @Transform(trimString)
  @IsOptional()
  @IsString()
  note?: string | null;
}
