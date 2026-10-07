import React, { useMemo, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  Admin, CanAccess, CustomRoutes, Layout, Menu, Resource, useCanAccess,
} from 'react-admin';
import { Button, CardContent, Typography } from '@mui/material';
import type { EmployeeAuthSession } from '../admin/auth-provider';
import { createEmployeeAuthProvider } from '../admin/auth-provider';
import { employeeDataProvider } from '../admin/data-provider';
import { vietnameseI18nProvider } from '../admin/i18n-provider';
import {
  CategoryCreate, CategoryEdit, CategoryList, EmployeeCreate, EmployeeEdit, EmployeeList,
  ProductCreate, ProductEdit, ProductList, PromotionCreate, PromotionEdit, PromotionList,
  SupplierCreate, SupplierEdit, SupplierList, VoucherCreate, VoucherEdit, VoucherList,
} from '../admin/resource-pages';
import { EmployeeLoginPage } from '../admin/EmployeeLoginPage';
import { AuthProvider as SessionProvider, useAuth } from '../context/AuthContext';
import { AdminOrdersPage } from '../pages/admin/AdminOrdersPage';
import { AdminPurchasingPage } from '../pages/admin/AdminPurchasingPage';
import { AdminRevenuePage } from '../pages/admin/AdminRevenuePage';
import type { EmployeeProfile } from '../types';

const operationalLinks = [
  { to: '/admin/orders', label: 'Đơn hàng', resource: 'orders' },
  { to: '/admin/imports', label: 'Phiếu nhập', resource: 'imports' },
];

function EmployeeMenu() {
  return (
    <nav aria-label="Khu vực quản lý">
      <Menu>
        {operationalLinks.map((item) => <CanAccess key={item.resource} action="list" resource={item.resource}><Menu.Item to={item.to} primaryText={item.label} /></CanAccess>)}
        <Menu.ResourceItem name="categories" />
        <Menu.ResourceItem name="products" />
        <Menu.ResourceItem name="promotions" />
        <Menu.ResourceItem name="vouchers" />
        <Menu.ResourceItem name="suppliers" />
        <CanAccess action="list" resource="revenue"><Menu.Item to="/admin/revenue" primaryText="Thống kê doanh thu" /></CanAccess>
        <Menu.ResourceItem name="employees" />
      </Menu>
    </nav>
  );
}

const EmployeeLayout = (props: React.ComponentProps<typeof Layout>) => <Layout {...props} menu={EmployeeMenu} />;

function AccessDenied() {
  return <section style={{ padding: 32 }}><h1>Không có quyền truy cập</h1><p role="alert">Vai trò hiện tại không được phép truy cập chức năng này.</p></section>;
}

function ProtectedWorkflow({ resource, children }: { resource: string; children: React.ReactNode }) {
  const { canAccess, error, isPending } = useCanAccess({ resource, action: 'list' });
  if (isPending) return <p role="status" style={{ padding: 24 }}>Đang kiểm tra quyền…</p>;
  if (error || canAccess === false) return <AccessDenied />;
  return <>{children}</>;
}

function ProtectedResourcePage({ resource, action, children }: { resource: string; action: string; children: React.ReactNode }) {
  const { canAccess, error, isPending } = useCanAccess({ resource, action });
  if (isPending) return <p role="status" style={{ padding: 24 }}>Đang kiểm tra quyền…</p>;
  if (error || canAccess === false) return <AccessDenied />;
  return <>{children}</>;
}

function protectResourcePage(resource: string, action: string, Page: React.ComponentType) {
  function ProtectedPage() {
    return <ProtectedResourcePage resource={resource} action={action}><Page /></ProtectedResourcePage>;
  }
  ProtectedPage.displayName = `Protected${Page.displayName ?? Page.name}`;
  return ProtectedPage;
}

const ProtectedCategoryList = protectResourcePage('categories', 'list', CategoryList);
const ProtectedCategoryCreate = protectResourcePage('categories', 'create', CategoryCreate);
const ProtectedCategoryEdit = protectResourcePage('categories', 'edit', CategoryEdit);
const ProtectedProductList = protectResourcePage('products', 'list', ProductList);
const ProtectedProductCreate = protectResourcePage('products', 'create', ProductCreate);
const ProtectedProductEdit = protectResourcePage('products', 'edit', ProductEdit);
const ProtectedPromotionList = protectResourcePage('promotions', 'list', PromotionList);
const ProtectedPromotionCreate = protectResourcePage('promotions', 'create', PromotionCreate);
const ProtectedPromotionEdit = protectResourcePage('promotions', 'edit', PromotionEdit);
const ProtectedVoucherList = protectResourcePage('vouchers', 'list', VoucherList);
const ProtectedVoucherCreate = protectResourcePage('vouchers', 'create', VoucherCreate);
const ProtectedVoucherEdit = protectResourcePage('vouchers', 'edit', VoucherEdit);
const ProtectedSupplierList = protectResourcePage('suppliers', 'list', SupplierList);
const ProtectedSupplierCreate = protectResourcePage('suppliers', 'create', SupplierCreate);
const ProtectedSupplierEdit = protectResourcePage('suppliers', 'edit', SupplierEdit);
const ProtectedEmployeeList = protectResourcePage('employees', 'list', EmployeeList);
const ProtectedEmployeeCreate = protectResourcePage('employees', 'create', EmployeeCreate);
const ProtectedEmployeeEdit = protectResourcePage('employees', 'edit', EmployeeEdit);

function AdminDashboard() {
  const { employee } = useAuth();
  return (
    <section style={{ padding: 24 }}>
      <Typography variant="h4" component="h1">Cổng quản trị bán hàng</Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>Xin chào {employee?.name ?? 'nhân viên'}. Chọn nghiệp vụ ở thanh điều hướng để bắt đầu.</Typography>
      {employee?.role === 'admin' && <Typography color="text.secondary" sx={{ mt: 1 }}>Admin có quyền quản lý nhân viên và theo dõi doanh thu.</Typography>}
    </section>
  );
}

function AdminCatchAll() {
  return <section style={{ padding: 32 }}><h1>Không tìm thấy trang quản trị</h1><p>Đường dẫn không thuộc mô-đun quản lý nào.</p></section>;
}

function StaffPathRedirect() {
  const { pathname, search, hash } = useLocation();
  const target = `/admin${pathname.slice('/staff'.length)}`;
  return <Navigate to={{ pathname: target === '/admin' ? '/admin/orders' : target, search, hash }} replace />;
}

function EmployeeLoginAlias() {
  const location = useLocation();
  return <Navigate to="/admin/login" state={location.state} replace />;
}

function EmployeeReactAdmin() {
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  const authProvider = useMemo(() => {
    const session: EmployeeAuthSession = {
      get employee() { return authRef.current.employee; },
      get employeeLoading() { return authRef.current.employeeLoading; },
      employeeLogin: (token: string, profile: EmployeeProfile) => authRef.current.employeeLogin(token, profile),
      employeeLogout: () => authRef.current.employeeLogout(),
      employeeClearSession: () => authRef.current.employeeClearSession(),
      refreshEmployeeProfile: () => authRef.current.refreshEmployeeProfile(),
    };
    return createEmployeeAuthProvider(session);
  }, []);

  return (
    <Admin
      basename="/admin"
      title="INDIGO STUDIO · Quản trị"
      dataProvider={employeeDataProvider}
      authProvider={authProvider}
      requireAuth
      loginPage={EmployeeLoginPage}
      layout={EmployeeLayout}
      dashboard={AdminDashboard}
      catchAll={AdminCatchAll}
      accessDenied={AccessDenied}
      i18nProvider={vietnameseI18nProvider}
      disableTelemetry
    >
      <Resource name="categories" list={ProtectedCategoryList} create={ProtectedCategoryCreate} edit={ProtectedCategoryEdit} options={{ label: 'Danh mục' }} />
      <Resource name="products" list={ProtectedProductList} create={ProtectedProductCreate} edit={ProtectedProductEdit} options={{ label: 'Sản phẩm' }} />
      <Resource name="promotions" list={ProtectedPromotionList} create={ProtectedPromotionCreate} edit={ProtectedPromotionEdit} options={{ label: 'Khuyến mãi' }} />
      <Resource name="vouchers" list={ProtectedVoucherList} create={ProtectedVoucherCreate} edit={ProtectedVoucherEdit} options={{ label: 'Voucher' }} />
      <Resource name="suppliers" list={ProtectedSupplierList} create={ProtectedSupplierCreate} edit={ProtectedSupplierEdit} options={{ label: 'Nhà cung cấp' }} />
      <Resource name="employees" list={ProtectedEmployeeList} create={ProtectedEmployeeCreate} edit={ProtectedEmployeeEdit} options={{ label: 'Nhân viên' }} />
      <CustomRoutes>
        <Route path="orders" element={<ProtectedWorkflow resource="orders"><AdminOrdersPage /></ProtectedWorkflow>} />
        <Route path="imports" element={<ProtectedWorkflow resource="imports"><AdminPurchasingPage section="imports" /></ProtectedWorkflow>} />
        <Route path="revenue" element={<ProtectedWorkflow resource="revenue"><AdminRevenuePage /></ProtectedWorkflow>} />
      </CustomRoutes>
    </Admin>
  );
}

export const AdminApp: React.FC = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <SessionProvider scope="employee">
      <main className="min-h-screen bg-canvas text-on-surface">
        <Routes>
          <Route path="/employee/login" element={<EmployeeLoginAlias />} />
          <Route path="/staff/*" element={<StaffPathRedirect />} />
          <Route path="/admin/*" element={<EmployeeReactAdmin />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </SessionProvider>
  </BrowserRouter>
);

export default AdminApp;
