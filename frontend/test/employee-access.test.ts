import { describe, expect, it } from 'vitest';
import { canAccessModule, canAccessPortal, EMPLOYEE_MODULES, isStaffRole } from '../src/portals/employee-access';
import type { EmployeeRole } from '../src/types';

const roles: (EmployeeRole | null)[] = [
  'admin', 'catalog_manager', 'promotion_manager', 'order_staff', 'purchasing_staff', 'unassigned', null,
];

describe('employee portal access', () => {
  it.each([
    ['catalog_manager', true], ['promotion_manager', true], ['order_staff', true],
    ['purchasing_staff', true], ['admin', false], ['unassigned', false], [null, false],
  ] as const)('classifies %s as staff: %s', (role, allowed) => {
    expect(isStaffRole(role)).toBe(allowed);
    expect(canAccessPortal('staff', role)).toBe(allowed);
  });

  it.each(roles)('allows only admin into the Admin portal (%s)', (role) => {
    expect(canAccessPortal('admin', role)).toBe(role === 'admin');
  });
});

describe('employee module permissions', () => {
  it.each([
    ['admin', ['orders', 'categories', 'products', 'promotions', 'suppliers', 'imports', 'employees']],
    ['catalog_manager', ['categories', 'products']],
    ['promotion_manager', ['promotions']],
    ['order_staff', ['orders']],
    ['purchasing_staff', ['suppliers', 'imports']],
    ['unassigned', []],
    [null, []],
  ] as const)('preserves the modules granted to %s', (role, allowed) => {
    expect(EMPLOYEE_MODULES.filter((module) => canAccessModule(module.path, role)).map((module) => module.path)).toEqual(allowed);
    for (const module of EMPLOYEE_MODULES) {
      expect(canAccessModule(module.path, role)).toBe((allowed as readonly string[]).includes(module.path));
      expect(module.roles.includes(role as EmployeeRole)).toBe((allowed as readonly string[]).includes(module.path));
    }
  });

  it.each(roles)('restricts employee management to admin (%s)', (role) => {
    expect(canAccessModule('employees', role)).toBe(role === 'admin');
  });

  it('denies unknown modules', () => {
    expect(canAccessModule('unknown', 'admin')).toBe(false);
  });
});
