import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const ADMIN_ORDER_STATUSES = ['pending', 'packed', 'cancelled'] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export class GetAdminOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(ADMIN_ORDER_STATUSES)
  status?: AdminOrderStatus;
}
