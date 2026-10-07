import React, { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const CustomerRoute: React.FC<{ children?: ReactNode }> = ({ children }) => {
  const {
    customer,
    customerLoading,
    customerRestoreError,
    refreshCustomerProfile,
  } = useAuth();
  const location = useLocation();

  if (customerLoading) {
    return (
      <section className="max-w-7xl mx-auto px-gutter py-16">
        <div className="max-w-lg mx-auto rounded-2xl bg-surface p-8 text-center shadow-sm">
          <p className="font-sans text-body-md text-on-surface-variant">Đang kiểm tra phiên khách hàng...</p>
        </div>
      </section>
    );
  }

  if (customerRestoreError) {
    return (
      <section className="max-w-7xl mx-auto px-gutter py-16">
        <div className="max-w-lg mx-auto rounded-2xl bg-surface p-8 text-center shadow-sm">
          <h1 className="font-sans text-headline-sm font-bold text-on-surface">Chưa thể xác minh tài khoản</h1>
          <p role="alert" className="mt-3 font-sans text-body-md text-on-surface-variant">
            {customerRestoreError}
          </p>
          <button
            type="button"
            onClick={() => void refreshCustomerProfile().catch(() => undefined)}
            className="mt-6 rounded-lg bg-primary px-5 py-3 font-sans text-label-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
            disabled={customerLoading}
          >
            Thử lại
          </button>
        </div>
      </section>
    );
  }

  if (!customer) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
