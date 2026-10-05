export const EMPLOYEE_ROLES = [
  'admin',
  'catalog_manager',
  'promotion_manager',
  'order_staff',
  'purchasing_staff',
  'unassigned',
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
