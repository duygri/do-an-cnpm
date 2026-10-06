import { describe, expect, it } from 'vitest';
import { canAccessModule, EMPLOYEE_MODULES } from '../src/portals/employee-access';
import type { EmployeeRole } from '../src/types';

const roles: EmployeeRole[] = ['admin', 'manager'];

describe('employee module permissions', () => {
  it('models only admin and manager roles', () => {
    expect(roles).toEqual(['admin', 'manager']);
  });

  it.each(roles)('%s can use every operational module', (role) => {
    const modules = EMPLOYEE_MODULES.filter((module) => canAccessModule(module.path, role));
    expect(modules.map((module) => module.path)).toEqual([
      'orders', 'categories', 'products', 'promotions', 'suppliers', 'imports',
      ...(role === 'admin' ? ['employees', 'revenue'] : []),
    ]);
  });

  it('restricts employee management to admin', () => {
    expect(canAccessModule('employees', 'admin')).toBe(true);
    expect(canAccessModule('employees', 'manager')).toBe(false);
  });

  it('restricts revenue statistics to admin', () => {
    expect(canAccessModule('revenue', 'admin')).toBe(true);
    expect(canAccessModule('revenue', 'manager')).toBe(false);
  });

  it('denies unknown modules', () => {
    expect(canAccessModule('unknown', 'admin')).toBe(false);
  });
});
