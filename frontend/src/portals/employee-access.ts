import type { EmployeeRole } from '../types';

export interface EmployeeModule {
  path: string;
  label: string;
  icon: string;
  roles: EmployeeRole[];
}

/** Shared permissions for employee navigation and module routing. */
export const EMPLOYEE_MODULES: EmployeeModule[] = [
  { path: 'orders', label: 'Đơn hàng', icon: 'receipt_long', roles: ['admin', 'order_staff'] },
  { path: 'categories', label: 'Danh mục', icon: 'category', roles: ['admin', 'catalog_manager'] },
  { path: 'products', label: 'Sản phẩm', icon: 'checkroom', roles: ['admin', 'catalog_manager'] },
  { path: 'promotions', label: 'Khuyến mãi', icon: 'sell', roles: ['admin', 'promotion_manager'] },
  { path: 'suppliers', label: 'Nhà cung cấp', icon: 'local_shipping', roles: ['admin', 'purchasing_staff'] },
  { path: 'imports', label: 'Phiếu nhập', icon: 'inventory', roles: ['admin', 'purchasing_staff'] },
  { path: 'employees', label: 'Nhân viên', icon: 'manage_accounts', roles: ['admin'] },
];

export function isStaffRole(role: EmployeeRole | null): boolean {
  return role === 'catalog_manager'
    || role === 'promotion_manager'
    || role === 'order_staff'
    || role === 'purchasing_staff';
}

export function canAccessPortal(portal: 'staff' | 'admin', role: EmployeeRole | null): boolean {
  return portal === 'staff' ? isStaffRole(role) : role === 'admin';
}

export function canAccessModule(modulePath: string, role: EmployeeRole | null): boolean {
  return role !== null && EMPLOYEE_MODULES.some((module) => module.path === modulePath && module.roles.includes(role));
}
