import { SetMetadata } from '@nestjs/common';
import type { EmployeeRole } from '../employees/employee-role';

export const EMPLOYEE_ROLES_KEY = 'employee_roles';

export const EmployeeRoles = (...roles: EmployeeRole[]) =>
  SetMetadata(EMPLOYEE_ROLES_KEY, roles);
