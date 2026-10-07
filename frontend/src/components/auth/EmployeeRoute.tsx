import React, { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const EmployeeRoute: React.FC<{ children?: ReactNode }> = ({ children }) => {
  const {
    employee,
    employeeLoading,
    employeeRestoreError,
    employeeLogout,
    refreshEmployeeProfile,
  } = useAuth();
  const location = useLocation();

  if (employeeLoading) {
    return (
      <section className="max-w-7xl mx-auto px-gutter py-16">
        <div className="max-w-lg mx-auto rounded-2xl bg-surface p-8 text-center shadow-sm">
          <p className="font-sans text-body-md text-on-surface-variant">Đang xác minh quyền nhân viên...</p>
          <button
            type="button"
            onClick={employeeLogout}
            className="mt-6 rounded-lg border border-border-neutral px-5 py-3 font-sans text-label-md font-semibold text-on-surface transition hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            Đăng xuất
          </button>
        </div>
      </section>
    );
  }

  if (employeeRestoreError) {
    return (
      <section className="max-w-7xl mx-auto px-gutter py-16">
        <div className="max-w-lg mx-auto rounded-2xl bg-surface p-8 text-center shadow-sm">
          <h1 className="font-sans text-headline-sm font-bold text-on-surface">Chưa thể xác minh quyền truy cập</h1>
          <p role="alert" className="mt-3 font-sans text-body-md text-on-surface-variant">
            {employeeRestoreError}
          </p>
          <button
            type="button"
            onClick={() => void refreshEmployeeProfile().catch(() => undefined)}
            className="mt-6 rounded-lg bg-primary px-5 py-3 font-sans text-label-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
            disabled={employeeLoading}
          >
            Thử lại
          </button>
          <button
            type="button"
            onClick={employeeLogout}
            className="mt-6 ml-3 rounded-lg border border-border-neutral px-5 py-3 font-sans text-label-md font-semibold text-on-surface hover:bg-surface-container-low"
          >
            Đăng xuất
          </button>
        </div>
      </section>
    );
  }

  if (!employee) {
    return <Navigate to="/employee/login" state={{ from: location }} replace />;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-border-neutral bg-surface px-gutter py-3">
        <p className="min-w-0 truncate font-sans text-body-sm text-on-surface-variant">
          Nhân viên: <span className="font-semibold text-on-surface">{employee.name}</span>
          <span className="ml-2 hidden text-outline sm:inline">{employee.role.replace(/_/g, ' ')}</span>
        </p>
        <button
          type="button"
          onClick={employeeLogout}
          className="shrink-0 rounded-lg border border-border-neutral px-4 py-2 font-sans text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Đăng xuất
        </button>
      </div>
      {children ? children : <Outlet />}
    </>
  );
};
