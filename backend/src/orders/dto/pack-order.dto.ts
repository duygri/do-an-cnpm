import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PACKING_TYPES = ['bag', 'box'] as const;

export type OrderPackingType = (typeof PACKING_TYPES)[number];

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNote(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim() || null;
}

export class PackOrderDto {
  @IsOptional()
  @Transform(({ value }) => trimValue(value as unknown))
  @IsIn(PACKING_TYPES)
  packingType?: OrderPackingType;

  @IsOptional()
  @Transform(({ value }) => trimNote(value as unknown))
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
