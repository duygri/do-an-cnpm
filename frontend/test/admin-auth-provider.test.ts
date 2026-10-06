import { describe, expect, it, vi } from 'vitest';
import { createEmployeeAuthProvider } from '../src/admin/auth-provider';
import type { EmployeeProfile } from '../src/types';

const employee = (role: EmployeeProfile['role']): EmployeeProfile => ({
  employeeId: 7, name: 'Nhân viên', email: 'staff@example.test', position: 'Vận hành', role, status: 'active',
});

function session(role: EmployeeProfile['role'] | null) {
  return {
    employee: role ? employee(role) : null,
    employeeLoading: false,
    employeeLogin: vi.fn(),
    employeeLogout: vi.fn(),
    refreshEmployeeProfile: vi.fn().mockResolvedValue(role ? employee(role) : null),
  };
}

describe('employee React Admin auth provider', () => {
  it('allows managers operational access but denies employee and revenue resources', async () => {
    const provider = createEmployeeAuthProvider(session('manager'));
    await expect(provider.canAccess!({ resource: 'products', action: 'list' })).resolves.toBe(true);
    await expect(provider.canAccess!({ resource: 'employees', action: 'list' })).resolves.toBe(false);
    await expect(provider.canAccess!({ resource: 'revenue', action: 'list' })).resolves.toBe(false);
  });

  it('allows admins to access employee and revenue resources', async () => {
    const provider = createEmployeeAuthProvider(session('admin'));
    await expect(provider.canAccess!({ resource: 'employees', action: 'list' })).resolves.toBe(true);
    await expect(provider.canAccess!({ resource: 'revenue', action: 'list' })).resolves.toBe(true);
  });

  it('clears the employee session on a 401 error', async () => {
    const state = session('manager');
    const provider = createEmployeeAuthProvider(state);
    await expect(provider.checkError!({ status: 401 })).rejects.toMatchObject({ status: 401 });
    expect(state.employeeLogout).toHaveBeenCalledOnce();
  });

  it('accepts a verified employee session without logging it out', async () => {
    const state = session('manager');
    const provider = createEmployeeAuthProvider(state);
    await expect(provider.checkAuth!({})).resolves.toBeUndefined();
    expect(state.employeeLogout).not.toHaveBeenCalled();
  });
});
