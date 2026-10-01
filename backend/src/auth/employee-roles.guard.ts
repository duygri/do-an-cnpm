import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EmployeeRole } from '../employees/employee-role';
import { AuthenticatedRequest } from './authenticated-request';
import { EMPLOYEE_ROLES_KEY } from './employee-roles.decorator';

@Injectable()
export class EmployeeRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<EmployeeRole[]>(
      EMPLOYEE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!roles?.length) return false;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const employee = request.employee;

    return (
      employee?.role !== undefined &&
      employee.role !== 'unassigned' &&
      (employee.role === 'admin' || roles.includes(employee.role))
    );
  }
}
