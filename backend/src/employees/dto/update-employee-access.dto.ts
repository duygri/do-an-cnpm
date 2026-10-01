import { IsIn, ValidateIf } from 'class-validator';
import { EMPLOYEE_ROLES } from '../employee-role';
import type { EmployeeRole } from '../employee-role';

export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export class UpdateEmployeeAccessDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(EMPLOYEE_ROLES)
  role?: EmployeeRole;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(EMPLOYEE_STATUSES)
  status?: EmployeeStatus;
}
