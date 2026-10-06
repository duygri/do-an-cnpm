import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class GetRevenueReportDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}
