import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from '../src/apps/AdminApp';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';
import type { EmployeeRole } from '../src/types';

vi.mock('../src/context/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/context/AuthContext')>(),
  useAuth: vi.fn(),
}));

function auth(role: EmployeeRole) {
  return {
    customer: null,
    employee: { employeeId: 1, name: 'Test employee', email: 'employee@example.test', position: '', role, status: 'active' as const },
    customerLoading: false,
    employeeLoading: false,
    customerRestoreError: null,
    employeeRestoreError: null,
    customerLogin: vi.fn(),
    customerLogout: vi.fn(),
    refreshCustomerProfile: vi.fn(),
    employeeLogin: vi.fn(),
    employeeLogout: vi.fn(),
    refreshEmployeeProfile: vi.fn(),
  };
}

const report = {
  from: '2026-10-01',
  to: '2026-10-03',
  timezone: 'Asia/Ho_Chi_Minh',
  paidOrderCount: 2,
  collectedAmount: '1250000.50',
  daily: [
    { date: '2026-10-01', orderCount: 1, amount: '500000.25' },
    { date: '2026-10-02', orderCount: 0, amount: '0.00' },
    { date: '2026-10-03', orderCount: 1, amount: '750000.25' },
  ],
};

describe('admin revenue statistics', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', '/admin/revenue');
    vi.spyOn(api, 'getRevenueReport').mockResolvedValue(report);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('requests the full current Vietnam calendar month on initial load', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T10:00:00+07:00'));

    render(<AdminApp />);

    await vi.waitFor(() => expect(api.getRevenueReport).toHaveBeenCalledWith('2026-02-01', '2026-02-28'));
  });

  it('shows the report only to admins and requests the selected date range', async () => {
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { name: 'Thống kê doanh thu' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Thống kê doanh thu' })).toBeTruthy();
    const from = screen.getByLabelText('Từ ngày') as HTMLInputElement;
    const to = screen.getByLabelText('Đến ngày') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-10-01' } });
    fireEvent.change(to, { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem báo cáo' }));

    await waitFor(() => expect(api.getRevenueReport).toHaveBeenLastCalledWith('2026-10-01', '2026-10-03'));
    expect(screen.getByText('1,250,000.50')).toBeTruthy();
    expect(screen.getAllByText('500,000.25')).toHaveLength(2);
    expect(screen.getByRole('cell', { name: '0.00' })).toBeTruthy();
  });

  it('hides the module and denies direct revenue navigation to managers', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('manager'));
    render(<AdminApp />);

    await screen.findByRole('heading', { name: 'Không có quyền truy cập' });
    expect(screen.queryByRole('menuitem', { name: 'Thống kê doanh thu' })).toBeNull();
    expect(api.getRevenueReport).not.toHaveBeenCalled();
  });
});
