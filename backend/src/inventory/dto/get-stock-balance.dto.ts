import { IsDateString } from 'class-validator';

export class GetStockBalanceDto {
  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;
}
