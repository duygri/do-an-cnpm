import React, { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canAccessPortal } from '../../portals/employee-access';
import { getPortalUrl } from '../../portals/portal-url';

export const EmployeeRoute: React.FC<{ children?: ReactNode; portal?: 'staff' | 'admin' }> = ({ children, portal = 'admin' }) => {
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
          <p className="font-body-md text-body-md text-on-surface-variant">Đang xác minh quyền nhân viên...</p>
          <button
            type="button"
            onClick={employeeLogout}
            className="mt-6 rounded-lg border border-border-neutral px-5 py-3 font-label-md text-label-md font-semibold text-on-surface transition hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">Chưa thể xác minh quyền truy cập</h1>
          <p role="alert" className="mt-3 font-body-md text-body-md text-on-surface-variant">
            {employeeRestoreError}
          </p>
          <button
            type="button"
            onClick={() => void refreshEmployeeProfile().catch(() => undefined)}
            className="mt-6 rounded-lg bg-primary px-5 py-3 font-label-md text-label-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
            disabled={employeeLoading}
          >
            Thử lại
          </button>
          <button
            type="button"
            onClick={employeeLogout}
            className="mt-6 ml-3 rounded-lg border border-border-neutral px-5 py-3 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-low"
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

  if (employee.role === 'unassigned') {
    return (
      <section className="max-w-7xl mx-auto px-gutter py-16">
        <div className="max-w-xl mx-auto rounded-2xl bg-surface p-8 text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-primary">lock</span>
          <h1 className="mt-3 font-headline-sm text-headline-sm font-bold text-on-surface">Tài khoản chưa được cấp quyền</h1>
          <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
            Tài khoản nhân viên của bạn chưa được gán mô-đun quản lý. Vui lòng liên hệ quản trị viên để được cấp quyền truy cập.
          </p>
          <button
            type="button"
            onClick={employeeLogout}
            className="mt-6 rounded-lg border border-border-neutral px-5 py-3 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-low"
          >
            Đăng xuất
          </button>
          <div className="mt-4">
            <a href={getPortalUrl('user', import.meta.env, window.location.origin)} className="font-label-md text-label-md font-semibold text-primary hover:underline">
              Về cửa hàng
            </a>
          </div>
        </div>
      </section>
    );
  }

  if (!canAccessPortal(portal, employee?.role ?? null)) {
    const otherPortal = canAccessPortal('admin', employee.role) ? 'admin' : 'staff';
    return (
      <section className="mx-auto max-w-xl px-gutter py-16 text-center">
        <h1 className="font-headline-sm text-headline-sm font-bold">Không có quyền truy cập</h1>
        <p role="alert" className="mt-3 text-on-surface-variant">Tài khoản này thuộc cổng {otherPortal === 'admin' ? 'quản trị' : 'nhân viên'}. Vui lòng đăng nhập tại cổng phù hợp.</p>
        <a href={`${getPortalUrl(otherPortal, import.meta.env, window.location.origin)}/employee/login`} className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-on-primary">
          {otherPortal === 'admin' ? 'Đến cổng quản trị' : 'Đến cổng nhân viên'}
        </a>
        <button onClick={employeeLogout} className="ml-3 rounded-lg border border-border-neutral px-5 py-3">Đăng xuất</button>
      </section>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-border-neutral bg-surface px-gutter py-3">
        <p className="min-w-0 truncate font-body-sm text-body-sm text-on-surface-variant">
          Nhân viên: <span className="font-semibold text-on-surface">{employee.name}</span>
          <span className="ml-2 hidden text-outline sm:inline">{employee.role.replace(/_/g, ' ')}</span>
        </p>
        <button
          type="button"
          onClick={employeeLogout}
          className="shrink-0 rounded-lg border border-border-neutral px-4 py-2 font-label-sm text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Đăng xuất
        </button>
      </div>
      {children ? children : <Outlet />}
    </>
  );
};
