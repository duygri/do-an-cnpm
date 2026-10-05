import { IsIn, ValidateIf } from 'class-validator';
import { EMPLOYEE_ROLES, type EmployeeRole } from '../employee-role';

export class UpdateEmployeeAccessDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(EMPLOYEE_ROLES)
  role?: EmployeeRole;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
