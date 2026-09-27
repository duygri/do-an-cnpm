export interface EmployeeProfile {
  employeeId: number;
  name: string;
  email: string;
  position: string;
}

export interface AccessTokenPayload {
  sub: string;
}
