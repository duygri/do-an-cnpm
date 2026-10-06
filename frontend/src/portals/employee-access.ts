import type { EmployeeRole } from '../types';

export interface EmployeeModule {
  path: string;
  label: string;
  icon: string;
  roles: EmployeeRole[];
}

/** Shared permissions for employee navigation and module routing. */
export const EMPLOYEE_MODULES: EmployeeModule[] = [
  { path: 'orders', label: 'Đơn hàng', icon: 'receipt_long', roles: ['admin', 'manager'] },
  { path: 'categories', label: 'Danh mục', icon: 'category', roles: ['admin', 'manager'] },
  { path: 'products', label: 'Sản phẩm', icon: 'checkroom', roles: ['admin', 'manager'] },
  { path: 'promotions', label: 'Khuyến mãi', icon: 'sell', roles: ['admin', 'manager'] },
  { path: 'suppliers', label: 'Nhà cung cấp', icon: 'local_shipping', roles: ['admin', 'manager'] },
  { path: 'imports', label: 'Phiếu nhập', icon: 'inventory', roles: ['admin', 'manager'] },
  { path: 'employees', label: 'Nhân viên', icon: 'manage_accounts', roles: ['admin'] },
  { path: 'revenue', label: 'Thống kê doanh thu', icon: 'monitoring', roles: ['admin'] },
];

export function canAccessModule(modulePath: string, role: EmployeeRole | null): boolean {
  return role !== null && EMPLOYEE_MODULES.some((module) => module.path === modulePath && module.roles.includes(role));
}
