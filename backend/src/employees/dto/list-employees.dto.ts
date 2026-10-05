import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListEmployeesDto {
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;

  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
