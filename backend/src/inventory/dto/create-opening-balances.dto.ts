import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class OpeningBalanceRowDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  variantId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  quantity!: number;
}

export class CreateOpeningBalancesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceRowDto)
  rows!: OpeningBalanceRowDto[];
}
