import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { AdminPortal } from '../src/pages/admin/AdminPortal';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';
import type { EmployeeRole } from '../src/types';
import { StaffApp } from '../src/apps/StaffApp';
import { AdminApp } from '../src/apps/AdminApp';
import { StaffRoute } from '../src/components/auth/StaffRoute';
import { AdminRoute } from '../src/components/auth/AdminRoute';
import { getPortalUrl } from '../src/portals/portal-url';
import * as portalNavigation from '../src/portals/portal-url';
import { Routes, Route } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

vi.mock('../src/context/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/context/AuthContext')>(),
  useAuth: vi.fn(),
}));

describe('Portal HTML bootstraps', () => {
  it.each([
    ['user', 'main.tsx'], ['staff', 'main.staff.tsx'], ['admin', 'main.admin.tsx'],
  ] as const)('loads the root-local %s bootstrap shim', (portal) => {
    const portalRoot = resolve('portals', portal);
    const document = new DOMParser().parseFromString(readFileSync(resolve(portalRoot, 'index.html'), 'utf8'), 'text/html');
    const scriptUrl = document.querySelector('script[type="module"]')?.getAttribute('src');
    expect(scriptUrl).toBe('/src/main.tsx');
    expect(existsSync(resolve(portalRoot, scriptUrl!.slice(1)))).toBe(true);
  });

  it.each([
    ['user', 'main.tsx'], ['staff', 'main.staff.tsx'], ['admin', 'main.admin.tsx'],
  ] as const)('imports the matching shared %s bootstrap from the local shim', (portal, bootstrap) => {
    const shimPath = resolve('portals', portal, 'src', 'main.tsx');
    expect(existsSync(shimPath)).toBe(true);
    const sharedImport = readFileSync(shimPath, 'utf8').match(/import\s+['"]([^'"]+)['"]/);
    expect(sharedImport).not.toBeNull();
    const sharedPath = resolve('portals', portal, 'src', sharedImport![1]);
    expect(sharedPath).toBe(resolve('src', bootstrap));
    expect(existsSync(sharedPath)).toBe(true);
  });

  it.each([
    ['user', 'main.tsx'], ['staff', 'main.staff.tsx'], ['admin', 'main.admin.tsx'],
  ] as const)('transforms the %s shim and shared bootstrap with real Vite', (portal, bootstrap) => {
    // Vite/esbuild require Node's typed-array realm, so run outside jsdom.
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      cwd: resolve('.'), encoding: 'utf8', timeout: 20_000,
      input: `
        import { createServer, normalizePath } from 'vite';
        import react from '@vitejs/plugin-react';
        const server = await createServer({
          configFile: false,
          root: ${JSON.stringify(resolve('portals', portal))},
          plugins: [react()], logLevel: 'silent',
          optimizeDeps: { noDiscovery: true, include: [] },
          server: { middlewareMode: true, hmr: false, watch: null, fs: { allow: [${JSON.stringify(resolve('.'))}] } },
        });
        try {
          const transformed = await server.transformRequest('/src/main.tsx');
          const shim = await server.moduleGraph.getModuleByUrl('/src/main.tsx');
          const shared = Array.from(shim.importedModules).find((module) => module.file === normalizePath(${JSON.stringify(resolve('src', bootstrap))}));
          const transformedShared = shared && await server.transformRequest(shared.url);
          process.stdout.write(JSON.stringify({ shimTransformed: Boolean(transformed), file: shared?.file, sharedTransformed: Boolean(transformedShared) }));
        } finally { await server.close(); }
      `,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      shimTransformed: true,
      file: resolve('src', bootstrap).replace(/\\/g, '/'),
      sharedTransformed: true,
    });
  });
});

function auth(role: EmployeeRole | null = null) {
  return {
    customer: null,
    employee: role ? { employeeId: 1, name: 'Test employee', email: 'employee@example.test', position: '', role, status: 'active' as const } : null,
    customerLoading: false, employeeLoading: false,
    customerRestoreError: null, employeeRestoreError: null,
    customerLogin: vi.fn(), customerLogout: vi.fn(), refreshCustomerProfile: vi.fn().mockResolvedValue(null),
    employeeLogin: vi.fn(), employeeLogout: vi.fn(), refreshEmployeeProfile: vi.fn().mockResolvedValue(null),
  };
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(auth());
  vi.stubEnv('VITE_STAFF_PORTAL_URL', 'https://staff.example.test');
  vi.stubEnv('VITE_ADMIN_PORTAL_URL', 'https://admin.example.test');
  vi.stubEnv('VITE_USER_PORTAL_URL', 'https://shop.example.test');
  window.history.replaceState({}, '', '/login');
  vi.spyOn(api, 'getManagedCategories').mockResolvedValue([]);
  vi.spyOn(api, 'getCatalogProducts').mockResolvedValue([]);
  vi.spyOn(api, 'getPromotions').mockResolvedValue([]);
  vi.spyOn(api, 'getSuppliers').mockResolvedValue([]);
  vi.spyOn(api, 'getImports').mockResolvedValue([]);
  vi.spyOn(api, 'getEmployees').mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
  vi.spyOn(api, 'getAdminOrders').mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
  vi.spyOn(api, 'getCustomerOrders').mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
});

const modules = [
  ['orders', 'Đơn hàng'], ['categories', 'Quản lý danh mục'], ['products', 'Quản lý sản phẩm'],
  ['promotions', 'Khuyến mãi và voucher'], ['suppliers', 'Nhà cung cấp và phiếu nhập'],
  ['imports', 'Nhà cung cấp và phiếu nhập'], ['employees', 'Tài khoản nhân viên'],
] as const;
const staffRoles = [
  ['order_staff', ['orders']], ['catalog_manager', ['categories', 'products']],
  ['promotion_manager', ['promotions']], ['purchasing_staff', ['suppliers', 'imports']],
] as const;

describe('Staff access matrix', () => {
  it.each([
    ['order_staff', '/staff/orders'], ['catalog_manager', '/staff/categories'],
    ['promotion_manager', '/staff/promotions'], ['purchasing_staff', '/staff/suppliers'],
  ] as const)('opens the first assigned Staff module for %s', async (role, destination) => {
    vi.mocked(useAuth).mockReturnValue(auth(role));
    window.history.replaceState({}, '', '/staff');
    render(<StaffApp />);
    await waitFor(() => expect(window.location.pathname).toBe(destination));
  });
  it('keeps catalog tabs and the empty catalog action inside Staff', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('catalog_manager'));
    window.history.replaceState({}, '', '/staff/products');
    render(<StaffApp />);
    expect((await screen.findByRole('link', { name: 'Mở quản lý danh mục' })).getAttribute('href')).toBe('/staff/categories');
    expect(screen.getAllByRole('link', { name: 'Danh mục' }).map((link) => link.getAttribute('href'))).toEqual(['/staff/categories', '/staff/categories']);
    expect(screen.getAllByRole('link', { name: 'Sản phẩm' }).map((link) => link.getAttribute('href'))).toEqual(['/staff/products', '/staff/products']);
  });
  it('returns an unknown Staff module to the Staff root', () => {
    vi.mocked(useAuth).mockReturnValue(auth('catalog_manager'));
    window.history.replaceState({}, '', '/staff/unknown');
    render(<StaffApp />);
    expect(screen.getByRole('link', { name: 'Về mô-đun được cấp quyền' }).getAttribute('href')).toBe('/staff');
  });
  for (const [role, allowed] of staffRoles) {
    it.each(modules)(`${role} can enter only assigned modules: %s`, async (module, title) => {
      vi.mocked(useAuth).mockReturnValue(auth(role));
      window.history.replaceState({}, '', `/staff/${module}`);
      render(<StaffApp />);
      if ((allowed as readonly string[]).includes(module)) {
        expect(await screen.findByRole('heading', { name: title, exact: true })).toBeTruthy();
      } else {
        expect(screen.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeTruthy();
        expect(screen.queryByRole('heading', { name: title, exact: true })).toBeNull();
      }
      const links = screen.getByRole('navigation', { name: 'Khu vực quản lý' }).querySelectorAll('a');
      expect(Array.from(links, (link) => link.getAttribute('href'))).toEqual(allowed.map((path) => `/staff/${path}`));
    });
  }

  it('denies admin on Staff with a configured Admin link', () => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', '/staff/employees');
    render(<StaffApp />);
    expect(screen.getByRole('link', { name: 'Đến cổng quản trị' }).getAttribute('href')).toBe('https://admin.example.test/employee/login');
    expect(screen.queryByRole('heading', { name: 'Tài khoản nhân viên' })).toBeNull();
  });
});

describe('Admin access matrix', () => {
  it.each(modules)('allows admin to enter %s', async (module, title) => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', `/admin/${module}`);
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: title, exact: true })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về cửa hàng' }).getAttribute('href')).toBe('https://shop.example.test');
  });

  it.each(staffRoles)('denies %s on Admin and links to Staff', (role) => {
    vi.mocked(useAuth).mockReturnValue(auth(role));
    window.history.replaceState({}, '', '/admin/employees');
    render(<AdminApp />);
    expect(screen.getByRole('link', { name: 'Đến cổng nhân viên' }).getAttribute('href')).toBe('https://staff.example.test/employee/login');
    expect(screen.queryByRole('heading', { name: 'Tài khoản nhân viên' })).toBeNull();
    expect(api.getEmployees).not.toHaveBeenCalled();
  });
});

describe('Employee guards', () => {
  for (const [basePath, Guard] of [['/staff', StaffRoute], ['/admin', AdminRoute]] as const) {
    it(`requires employee authentication at ${basePath}`, () => {
      vi.mocked(useAuth).mockReturnValue({ ...auth(), customer: { customerId: 2, name: 'Customer', email: 'customer@example.test' } });
      render(<MemoryRouter initialEntries={[`${basePath}/orders`]}><Routes>
        <Route path={`${basePath}/*`} element={<Guard><p>Protected content</p></Guard>} />
        <Route path="/employee/login" element={<p>Employee login destination</p>} />
      </Routes></MemoryRouter>);
      expect(screen.getByText('Employee login destination')).toBeTruthy();
      expect(screen.queryByText('Protected content')).toBeNull();
    });
    it(`denies unassigned at ${basePath}`, () => {
      vi.mocked(useAuth).mockReturnValue(auth('unassigned'));
      render(<MemoryRouter><Guard><p>Protected content</p></Guard></MemoryRouter>);
      expect(screen.getByRole('heading', { name: 'Tài khoản chưa được cấp quyền' })).toBeTruthy();
      expect(screen.queryByText('Protected content')).toBeNull();
    });
    it(`waits for verified employee profile at ${basePath}`, () => {
      vi.mocked(useAuth).mockReturnValue({ ...auth('admin'), employeeLoading: true });
      render(<MemoryRouter><Guard><p>Protected content</p></Guard></MemoryRouter>);
      expect(screen.getByText('Đang xác minh quyền nhân viên...')).toBeTruthy();
      expect(screen.queryByText('Protected content')).toBeNull();
    });
    it(`denies access on profile restore failure at ${basePath}`, () => {
      vi.mocked(useAuth).mockReturnValue({ ...auth('admin'), employeeRestoreError: 'API unavailable' });
      render(<MemoryRouter><Guard><p>Protected content</p></Guard></MemoryRouter>);
      expect(screen.getByRole('alert').textContent).toBe('API unavailable');
      expect(screen.queryByText('Protected content')).toBeNull();
    });
  }
});

describe('Customer routes', () => {
  it('does not use an employee account to enter customer orders', () => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', '/orders');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeTruthy();
    expect(api.getCustomerOrders).not.toHaveBeenCalled();
  });
  it('allows an authenticated customer into orders', async () => {
    vi.mocked(useAuth).mockReturnValue({ ...auth(), customer: { customerId: 2, name: 'Customer', email: 'customer@example.test' } });
    window.history.replaceState({}, '', '/orders');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeTruthy();
  });
  it.each(['/admin/employees', '/staff/orders'])('does not mount employee modules at %s on User', (path) => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(screen.queryByRole('navigation', { name: 'Khu vực quản lý' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
  });
  for (const [path, Component] of [['/cart', StaffApp], ['/orders', AdminApp]] as const) {
    it(`does not mount customer route ${path} in an employee portal`, () => {
      window.history.replaceState({}, '', path);
      render(<Component />);
      expect(screen.getByRole('heading', { name: 'Đăng nhập nhân viên' })).toBeTruthy();
      expect(api.getCustomerOrders).not.toHaveBeenCalled();
    });
  }
});

describe('Employee login destinations', () => {
  it.each([
    ['catalog_manager', StaffApp, '/staff/products', '/staff/products'],
    ['catalog_manager', StaffApp, '/admin/employees', '/staff/categories'],
    ['admin', AdminApp, '/admin/employees', '/admin/employees'],
  ] as const)('returns verified %s to an allowed local destination (%s)', async (role, Component, from, destination) => {
    const session = auth(role);
    session.employee = null;
    session.employeeLogin.mockImplementation(() => { session.employee = auth(role).employee; });
    session.refreshEmployeeProfile.mockResolvedValue(auth(role).employee);
    vi.mocked(useAuth).mockImplementation(() => session);
    vi.spyOn(api, 'employeeLogin').mockResolvedValue({ access_token: 'employee-token', token_type: 'Bearer', expires_in: 3600, employee: auth(role).employee! });
    window.history.replaceState({ usr: { from: { pathname: from, search: '?test=1', hash: '#section' } } }, '', '/employee/login');
    render(<Component />);
    fireEvent.change(screen.getByLabelText('Email công việc'), { target: { value: 'employee@example.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập', exact: true }));
    await waitFor(() => expect(window.location.pathname).toBe(destination));
    if (from === destination) {
      expect(window.location.search).toBe('?test=1');
      expect(window.location.hash).toBe('#section');
    } else {
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('');
    }
  });
  it.each([['admin', StaffApp, 'https://admin.example.test/employee/login'], ['order_staff', AdminApp, 'https://staff.example.test/employee/login']] as const)('directs verified %s to the appropriate portal login', async (role, Component, url) => {
    const session = auth();
    session.refreshEmployeeProfile.mockResolvedValue(auth(role).employee);
    vi.mocked(useAuth).mockReturnValue(session);
    vi.spyOn(api, 'employeeLogin').mockResolvedValue({ access_token: 'private-token', token_type: 'Bearer', expires_in: 3600, employee: auth(role).employee! });
    const redirect = vi.spyOn(portalNavigation, 'redirectToPortal').mockImplementation(() => undefined);
    window.history.replaceState({}, '', '/employee/login');
    render(<Component />);
    fireEvent.change(screen.getByLabelText('Email công việc'), { target: { value: 'employee@example.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập', exact: true }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(url));
  });
});

describe('Portal URLs', () => {
  it.each([['user', 5173], ['staff', 5174], ['admin', 5175]] as const)('defaults %s to its port on the current host', (portal, port) => {
    expect(getPortalUrl(portal, {}, 'http://192.168.1.25:1234')).toBe(`http://192.168.1.25:${port}`);
    expect(getPortalUrl(portal, {}, 'https://[::1]:1234')).toBe(`https://[::1]:${port}`);
  });
  it.each([['user', 'VITE_USER_PORTAL_URL'], ['staff', 'VITE_STAFF_PORTAL_URL'], ['admin', 'VITE_ADMIN_PORTAL_URL']] as const)('uses the configured %s URL', (portal, key) => {
    expect(getPortalUrl(portal, { [key]: 'https://portal.example.test/' }, 'http://localhost:5173')).toBe('https://portal.example.test');
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('User portal separation', () => {
  it('links customer login to the configured Staff origin', () => {
    render(<App />);
    expect(screen.getAllByRole('link', { name: 'Đăng nhập nhân viên' }).every((link) => link.getAttribute('href') === 'https://staff.example.test/employee/login')).toBe(true);
    expect(screen.getByRole('link', { name: 'Cổng quản trị' }).getAttribute('href')).toBe('https://admin.example.test/employee/login');
  });

  it('does not mount employee login inside User', () => {
    window.history.replaceState({}, '', '/employee/login');
    render(<App />);
    expect(screen.queryByRole('heading', { name: 'Đăng nhập nhân viên' })).toBeNull();
  });
});

describe('Portal authentication ownership', () => {
  it.each(['customer', 'employee', 'all', undefined] as const)('restores and refreshes only the configured actor (%s)', async (scope) => {
    const actual = await vi.importActual<typeof import('../src/context/AuthContext')>('../src/context/AuthContext');
    window.localStorage.setItem('customer_token', 'customer-token');
    window.localStorage.setItem('employee_token', 'employee-token');
    const customerProfile = vi.spyOn(api, 'getCustomerProfile').mockResolvedValue({ customerId: 2, name: 'Customer', email: 'customer@example.test' });
    const employeeProfile = vi.spyOn(api, 'getEmployeeProfile').mockResolvedValue(auth('admin').employee!);
    function Probe() {
      const session = actual.useAuth();
      return <button onClick={() => { void session.refreshCustomerProfile(); void session.refreshEmployeeProfile(); }}>Refresh sessions</button>;
    }
    render(<actual.AuthProvider scope={scope}><Probe /></actual.AuthProvider>);
    await waitFor(() => {
      expect(customerProfile).toHaveBeenCalledTimes(scope === 'employee' ? 0 : 1);
      expect(employeeProfile).toHaveBeenCalledTimes(scope === 'customer' ? 0 : 1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }));
    await waitFor(() => {
      expect(customerProfile).toHaveBeenCalledTimes(scope === 'employee' ? 0 : 2);
      expect(employeeProfile).toHaveBeenCalledTimes(scope === 'customer' ? 0 : 2);
    });
    expect(window.localStorage.getItem('customer_token')).toBe('customer-token');
    expect(window.localStorage.getItem('employee_token')).toBe('employee-token');
    if (scope === 'customer' || scope === 'employee') {
      const other = scope === 'customer' ? 'employee' : 'customer';
      window.dispatchEvent(new CustomEvent('indigo:auth-unauthorized', { detail: { owner: other } }));
      expect(window.localStorage.getItem(`${other}_token`)).toBe(`${other}-token`);
    }
  });
  it('does not restore an employee token in User', async () => {
    window.localStorage.setItem('employee_token', 'employee-token');
    const employeeProfile = vi.spyOn(api, 'getEmployeeProfile').mockResolvedValue(auth('admin').employee!);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeTruthy());
    expect(employeeProfile).not.toHaveBeenCalled();
  });
  it.each([StaffApp, AdminApp])('does not restore a customer token in an employee portal', async (Component) => {
    window.localStorage.setItem('customer_token', 'customer-token');
    const customerProfile = vi.spyOn(api, 'getCustomerProfile').mockResolvedValue({ customerId: 2, name: 'Customer', email: 'customer@example.test' });
    render(<Component />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đăng nhập nhân viên' })).toBeTruthy());
    expect(customerProfile).not.toHaveBeenCalled();
  });
});

describe('Staff module routing', () => {
  it('recognizes the Staff base path and renders the assigned orders module', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('order_staff'));
    vi.spyOn(api, 'getAdminOrders').mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    render(<MemoryRouter initialEntries={['/staff/orders']}><AdminPortal {...{ basePath: '/staff' as const }} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /Đơn hàng/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đơn hàng' }).getAttribute('href')).toBe('/staff/orders');
  });
});
