import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { EMPLOYEE_MODULES, canAccessModule } from '../../portals/employee-access';
import { AdminOrdersPage } from './AdminOrdersPage';
import { AdminCatalogPage } from './AdminCatalogPage';
import { AdminPromotionsPage } from './AdminPromotionsPage';
import { AdminPurchasingPage } from './AdminPurchasingPage';
import { AdminEmployeesPage } from './AdminEmployeesPage';
import { useAuth } from '../../context/AuthContext';

const moduleLabels: Record<string, string> = {
  categories: 'Danh mục',
  products: 'Sản phẩm',
  promotions: 'Khuyến mãi và voucher',
  suppliers: 'Nhà cung cấp',
  imports: 'Phiếu nhập',
  employees: 'Nhân viên',
};

const AccessDenied: React.FC<{ moduleName: string; returnPath: string }> = ({ moduleName, returnPath }) => (
  <section className="rounded-2xl border border-destructive/20 bg-surface p-8 text-center shadow-sm sm:p-12">
    <span aria-hidden="true" className="material-symbols-outlined text-4xl text-destructive">lock</span>
    <h2 className="mt-3 font-headline-sm text-headline-sm font-bold text-on-surface">Không có quyền truy cập</h2>
    <p role="alert" className="mx-auto mt-2 max-w-xl font-body-md text-body-md text-on-surface-variant">
      Vai trò hiện tại không được phép truy cập mô-đun {moduleName.toLowerCase()}. Nếu cần quyền này, hãy liên hệ quản trị viên.
    </p>
    <Link to={returnPath} className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md font-semibold text-on-primary hover:opacity-90">
      Về mô-đun được cấp quyền
    </Link>
  </section>
);

const ComingSoon: React.FC<{ title: string }> = ({ title }) => (
  <section className="rounded-2xl border border-outline-variant bg-surface p-8 text-center shadow-sm sm:p-12">
    <span aria-hidden="true" className="material-symbols-outlined text-4xl text-primary">construction</span>
    <h2 className="mt-3 font-headline-sm text-headline-sm font-bold text-on-surface">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl font-body-md text-body-md text-on-surface-variant">
      Màn hình sẽ kết nối với hệ thống quản lý trong bước tiếp theo.
    </p>
  </section>
);

const NotFound: React.FC<{ returnPath: string }> = ({ returnPath }) => (
  <section className="rounded-2xl border border-outline-variant bg-surface p-8 text-center shadow-sm sm:p-12">
    <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Không tìm thấy trang quản lý</h2>
    <p className="mt-2 font-body-md text-body-md text-on-surface-variant">Đường dẫn không thuộc mô-đun quản lý nào.</p>
    <Link to={returnPath} className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md font-semibold text-on-primary hover:opacity-90">
      Về mô-đun được cấp quyền
    </Link>
  </section>
);

export const AdminPortal: React.FC<{ basePath: '/admin' }> = ({ basePath }) => {
  const { employee } = useAuth();
  const { pathname } = useLocation();
  const modulePath = pathname.slice(basePath.length).replace(/^\//, '').split('/')[0];

  if (!modulePath) {
    const firstAllowedModule = employee
      ? EMPLOYEE_MODULES.find((item) => canAccessModule(item.path, employee.role))
      : undefined;
    return <Navigate to={firstAllowedModule ? `${basePath}/${firstAllowedModule.path}` : '/'} replace />;
  }

  const module = EMPLOYEE_MODULES.find((item) => item.path === modulePath);
  if (!module) return <AdminLayout basePath={basePath}><NotFound returnPath={basePath} /></AdminLayout>;

  const moduleName = moduleLabels[modulePath] ?? module.label;
  if (!employee || !canAccessModule(modulePath, employee.role)) {
    const firstAllowedModule = employee
      ? EMPLOYEE_MODULES.find((item) => canAccessModule(item.path, employee.role))
      : undefined;
    return <AdminLayout basePath={basePath}><AccessDenied moduleName={moduleName} returnPath={firstAllowedModule ? `${basePath}/${firstAllowedModule.path}` : '/'} /></AdminLayout>;
  }

  if (modulePath === 'orders') {
    return <AdminLayout basePath={basePath}><AdminOrdersPage /></AdminLayout>;
  }

  if (modulePath === 'categories' || modulePath === 'products') {
    return <AdminLayout basePath={basePath}><AdminCatalogPage section={modulePath} basePath={basePath} /></AdminLayout>;
  }

  if (modulePath === 'promotions') {
    return <AdminLayout basePath={basePath}><AdminPromotionsPage /></AdminLayout>;
  }

  if (modulePath === 'suppliers' || modulePath === 'imports') {
    return <AdminLayout basePath={basePath}><AdminPurchasingPage /></AdminLayout>;
  }

  if (modulePath === 'employees') {
    return <AdminLayout basePath={basePath}><AdminEmployeesPage /></AdminLayout>;
  }

  return <AdminLayout basePath={basePath}><ComingSoon title={moduleName} /></AdminLayout>;
};
