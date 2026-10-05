import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPLOYEE_ROLES } from '../employees/employee-role';
import { AuthenticatedRequest } from './authenticated-request';
import { EMPLOYEE_ROLES_KEY } from './employee-roles.decorator';

@Injectable()
export class EmployeeRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<readonly string[]>(
      EMPLOYEE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!Array.isArray(roles) || roles.length === 0) {
      return false;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.employee?.role;

    if (!role || !EMPLOYEE_ROLES.includes(role)) {
      return false;
    }

    return role === 'admin' || roles.includes(role);
  }
}
