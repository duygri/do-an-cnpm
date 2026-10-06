export const EMPLOYEE_ROLES = ['admin', 'manager'] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
