import type { EmployeeRole } from '../employees/employee-role';

export interface EmployeeProfile {
  employeeId: number;
  name: string;
  email: string;
  position: string;
  role: EmployeeRole;
}

export interface AccessTokenPayload {
  sub: string;
  actorType?: 'employee' | 'customer';
}
