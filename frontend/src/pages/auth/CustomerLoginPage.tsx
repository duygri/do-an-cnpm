import React, { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

function returnToLocation(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/';
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } }).from;
  if (typeof from?.pathname !== 'string' || !from.pathname.startsWith('/') || from.pathname.startsWith('//')) {
    return '/';
  }
  const search = typeof from.search === 'string' ? from.search : '';
  const hash = typeof from.hash === 'string' ? from.hash : '';
  return `${from.pathname}${search}${hash}`;
}

export const CustomerLoginPage: React.FC = () => {
  const { customerLogin } = useAuth();
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
      const response = await api.customerLogin(email.trim(), password);
      customerLogin(response.access_token, response.customer);
      navigate(returnToLocation(location.state), { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Đăng nhập không thành công. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-gutter py-12 sm:py-16">
      <div className="max-w-md mx-auto rounded-2xl border border-border-neutral bg-surface p-6 shadow-sm sm:p-8">
        <p className="font-sans text-label-sm font-semibold uppercase tracking-wider text-primary">Tài khoản INDIGO</p>
        <h1 className="mt-2 font-sans text-headline-md font-bold text-on-surface">Đăng nhập</h1>
        <p className="mt-2 font-sans text-body-md text-on-surface-variant">Đăng nhập để xem đơn hàng và tiếp tục mua sắm.</p>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-error-container px-4 py-3 font-sans text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="font-sans text-label-md font-medium text-on-surface">Email</span>
            <input
              type="email"
              autoComplete="email"
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
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center font-sans text-body-sm text-on-surface-variant">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">Đăng ký</Link>
        </p>
      </div>
    </section>
  );
};
