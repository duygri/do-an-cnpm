import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { EMPLOYEE_MODULES as modules } from '../../portals/employee-access';
import { canAccessModule } from '../../portals/employee-access';
import { getPortalUrl } from '../../portals/portal-url';

export const ADMIN_MODULES = modules;

export const AdminLayout: React.FC<{ children: React.ReactNode; basePath: '/admin' }> = ({ children, basePath }) => {
  const { employee } = useAuth();
  const role = employee?.role ?? 'employee';
  const allowedModules = modules.filter((module) => canAccessModule(module.path, employee?.role ?? null));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:gap-7 lg:px-8 lg:py-8">
      <aside className="w-full shrink-0 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm lg:sticky lg:top-5 lg:h-fit lg:w-64">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div>
            <p className="font-sans text-label-sm font-bold uppercase tracking-[0.16em] text-primary">Cửa hàng</p>
            <h1 className="mt-1 font-sans text-headline-sm font-bold text-on-surface">Quản lý</h1>
          </div>
          <a href={getPortalUrl('user', import.meta.env, window.location.origin)} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low lg:mt-4 lg:inline-flex">
            Về cửa hàng
          </a>
        </div>

        <nav aria-label="Khu vực quản lý" className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {allowedModules.map((module) => (
            <NavLink
              key={module.path}
              to={`${basePath}/${module.path}`}
              className={({ isActive }) => `inline-flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-label-sm font-semibold transition ${isActive ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{module.icon}</span>
              {module.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-5 hidden border-t border-outline-variant pt-4 lg:block">
          <p className="truncate font-sans text-label-sm font-semibold text-on-surface">{employee?.name ?? 'Nhân viên'}</p>
          <p className="mt-1 font-sans text-body-xs capitalize text-on-surface-variant">{role.replace(/_/g, ' ')}</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
