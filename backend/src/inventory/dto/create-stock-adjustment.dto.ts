import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsPositive,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { InventoryDirection } from '../entities/inventory-movement.entity';

export class CreateStockAdjustmentDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  variantId!: number;

  @IsIn(['in', 'out'])
  direction!: InventoryDirection;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  quantity!: number;

  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}
