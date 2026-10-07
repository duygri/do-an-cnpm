import React, { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { canAccessModule, EMPLOYEE_MODULES } from '../../portals/employee-access';
import { getPortalUrl } from '../../portals/portal-url';
import type { EmployeeRole } from '../../types';

function returnToLocation(state: unknown, basePath: '/admin', role: EmployeeRole): string {
  const firstModule = EMPLOYEE_MODULES.find((module) => canAccessModule(module.path, role));
  const fallback = firstModule ? `${basePath}/${firstModule.path}` : basePath;
  if (typeof state !== 'object' || state === null || !('from' in state)) return fallback;
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } }).from;
  if (typeof from?.pathname !== 'string' || !from.pathname.startsWith(`${basePath}/`)
    || !canAccessModule(from.pathname.slice(basePath.length + 1).split('/')[0], role)) {
    return fallback;
  }
  const search = typeof from.search === 'string' ? from.search : '';
  const hash = typeof from.hash === 'string' ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

export const EmployeeLoginPage: React.FC<{ basePath: '/admin' }> = ({ basePath }) => {
  const { employeeLogin, refreshEmployeeProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.employeeLogin(email.trim(), password);
      employeeLogin(response.access_token, response.employee);
      const profile = await refreshEmployeeProfile();
      if (!profile) {
        setError('Không thể xác minh hồ sơ nhân viên. Vui lòng đăng nhập lại.');
        return;
      }
      navigate(returnToLocation(location.state, basePath, profile.role), { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Đăng nhập không thành công. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-gutter py-12 sm:py-16">
      <div className="max-w-md mx-auto rounded-2xl border border-border-neutral bg-surface p-6 shadow-sm sm:p-8">
        <p className="font-sans text-label-sm font-semibold uppercase tracking-wider text-primary">Cổng quản lý</p>
        <h1 className="mt-2 font-sans text-headline-md font-bold text-on-surface">Đăng nhập nhân viên</h1>
        <p className="mt-2 font-sans text-body-md text-on-surface-variant">Đăng nhập bằng tài khoản nhân viên INDIGO STUDIO.</p>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-error-container px-4 py-3 font-sans text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="font-sans text-label-md font-medium text-on-surface">Email công việc</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-sans text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block">
            <span className="font-sans text-label-md font-medium text-on-surface">Mật khẩu</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border-neutral bg-surface px-3.5 py-3 font-sans text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-5 py-3 font-sans text-label-md font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Đang xác minh...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center font-sans text-body-sm text-on-surface-variant">
          Bạn là khách hàng?{' '}
          <a href={`${getPortalUrl('user', import.meta.env, window.location.origin)}/login`} className="font-semibold text-primary hover:underline">Đăng nhập tại đây</a>
        </p>
      </div>
    </section>
  );
};
