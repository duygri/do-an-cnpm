import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { session } from '../src/nova/api';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';
import type { EmployeeRole } from '../src/types';
import { AdminApp } from '../src/apps/AdminApp';
import { AdminRoute } from '../src/components/auth/AdminRoute';
import { getPortalUrl } from '../src/portals/portal-url';
import { Routes, Route, MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

vi.mock('../src/context/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/context/AuthContext')>(),
  useAuth: vi.fn(),
}));

describe('Portal HTML bootstraps', () => {
  it.each([
    ['user', 'main.tsx'], ['admin', 'main.admin.tsx'],
  ] as const)('loads the root-local %s bootstrap shim', (portal) => {
    const portalRoot = resolve('portals', portal);
    const document = new DOMParser().parseFromString(readFileSync(resolve(portalRoot, 'index.html'), 'utf8'), 'text/html');
    const scriptUrl = document.querySelector('script[type="module"]')?.getAttribute('src');
    expect(scriptUrl).toBe('/src/main.tsx');
    expect(existsSync(resolve(portalRoot, scriptUrl!.slice(1)))).toBe(true);
  });

  it('removes the separate staff application and server target', () => {
    expect(existsSync(resolve('vite.staff.config.ts'))).toBe(false);
    expect(existsSync(resolve('src/main.staff.tsx'))).toBe(false);
    expect(existsSync(resolve('src/apps/StaffApp.tsx'))).toBe(false);
    expect(existsSync(resolve('src/components/auth/StaffRoute.tsx'))).toBe(false);
    expect(existsSync(resolve('portals/staff'))).toBe(false);
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(Object.keys(packageJson.scripts).some((script) => /staff/.test(script))).toBe(false);
    expect(Object.values(packageJson.scripts).some((script) => /staff/.test(script))).toBe(false);
    expect(readFileSync(resolve('src/vite-env.d.ts'), 'utf8')).not.toContain('VITE_STAFF_PORTAL_URL');
  });

  it.each([
    ['user', 'main.tsx'], ['admin', 'main.admin.tsx'],
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
    ['user', 'main.tsx'], ['admin', 'main.admin.tsx'],
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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(String(url).includes('/profile') ? { customerId: 2, name: 'Customer', email: 'customer@example.test' } : String(url).includes('/orders') ? { items: [], page: 1, limit: 10, total: 0 } : []), { status: 200 })));
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
  ['orders', 'Đơn hàng'], ['categories', 'Danh mục'], ['products', 'Sản phẩm'],
  ['promotions', 'Khuyến mãi'], ['vouchers', 'Voucher'], ['suppliers', 'Nhà cung cấp'],
  ['imports', 'Phiếu nhập'], ['employees', 'Nhân viên'], ['revenue', 'Thống kê doanh thu'],
] as const;
describe('Unified management access matrix', () => {
  it('shows managers all operational modules but hides employee management', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('manager'));
    window.history.replaceState({}, '', '/admin/orders');
    render(<AdminApp />);
    await screen.findByRole('navigation', { name: 'Khu vực quản lý' });
    for (const label of ['Đơn hàng', 'Phiếu nhập', 'Danh mục', 'Sản phẩm', 'Khuyến mãi', 'Voucher', 'Nhà cung cấp']) {
      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Nhân viên')).toBeNull();
    expect(screen.queryByText('Thống kê doanh thu')).toBeNull();
  });

  it('denies a manager direct access to employee management', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('manager'));
    window.history.replaceState({}, '', '/admin/employees');
    render(<AdminApp />);
    await screen.findByRole('heading', { name: 'Không có quyền truy cập' });
    expect(api.getEmployees).not.toHaveBeenCalled();
  });

  it('redirects legacy staff paths to the matching management path', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('manager'));
    window.history.replaceState({}, '', '/staff/products?filter=active#list');
    render(<AdminApp />);
    await waitFor(() => expect(window.location.pathname).toBe('/admin/products'));
    expect(window.location.search).toBe('?filter=active');
    expect(window.location.hash).toBe('#list');
  });
});

describe('Admin access matrix', () => {
  it.each(modules)('allows admin to enter %s', async (module, title) => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', `/admin/${module}`);
    render(<AdminApp />);
    expect((await screen.findAllByRole('heading', { name: title, exact: true })).length).toBeGreaterThan(0);
  });

  it('lets admin manage employee accounts', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', '/admin/employees');
    render(<AdminApp />);
    expect((await screen.findAllByRole('heading', { name: 'Nhân viên' })).length).toBeGreaterThan(0);
    await waitFor(() => expect(api.getEmployees).toHaveBeenCalledOnce());
    expect(screen.getByRole('menuitem', { name: 'Nhân viên' })).toBeTruthy();
  });

  it('offers only the two employee roles in the account form', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', '/admin/employees');
    const list = render(<AdminApp />);
    const createLink = await screen.findByRole('link', { name: 'Thêm nhân viên' });
    expect(createLink.getAttribute('href')).toBe('/admin/employees/create');
    list.unmount();
    window.history.replaceState({}, '', '/admin/employees/create');
    render(<AdminApp />);
    await screen.findByRole('heading', { name: 'Tạo tài khoản nhân viên' });
    const roleSelect = screen.getByRole('combobox', { name: 'Vai trò' });
    fireEvent.mouseDown(roleSelect);
    expect(await screen.findByRole('option', { name: 'Admin' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Manager' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Staff' })).toBeNull();
  });
});

describe('Employee guards', () => {
  it('requires employee authentication on the management portal', () => {
    vi.mocked(useAuth).mockReturnValue({ ...auth(), customer: { customerId: 2, name: 'Customer', email: 'customer@example.test' } });
    render(<MemoryRouter initialEntries={['/admin/orders']}><Routes>
      <Route path="/admin/*" element={<AdminRoute><p>Protected content</p></AdminRoute>} />
      <Route path="/employee/login" element={<p>Employee login destination</p>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText('Employee login destination')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('allows either active employee role into the shared route guard', () => {
    for (const role of ['admin', 'manager'] as const) {
      vi.mocked(useAuth).mockReturnValue(auth(role));
      const view = render(<MemoryRouter><AdminRoute><p>Protected content</p></AdminRoute></MemoryRouter>);
      expect(screen.getByText('Protected content')).toBeTruthy();
      view.unmount();
    }
  });

  it('waits for the verified employee profile', () => {
    vi.mocked(useAuth).mockReturnValue({ ...auth('manager'), employeeLoading: true });
    render(<MemoryRouter><AdminRoute><p>Protected content</p></AdminRoute></MemoryRouter>);
    expect(screen.getByText('Đang xác minh quyền nhân viên...')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('denies access on employee profile restore failure', () => {
    vi.mocked(useAuth).mockReturnValue({ ...auth('admin'), employeeRestoreError: 'API unavailable' });
    render(<MemoryRouter><AdminRoute><p>Protected content</p></AdminRoute></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toBe('API unavailable');
    expect(screen.queryByText('Protected content')).toBeNull();
  });
});

describe('Customer routes', () => {
  it('does not use an employee account to enter customer orders', async () => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', '/orders');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'WELCOME BACK', exact: true })).toBeTruthy();
    expect(api.getCustomerOrders).not.toHaveBeenCalled();
  });
  it('allows an authenticated customer into orders', async () => {
    session.set('customer-token');
    vi.mocked(useAuth).mockReturnValue({ ...auth(), customer: { customerId: 2, name: 'Customer', email: 'customer@example.test' } });
    window.history.replaceState({}, '', '/orders');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'ĐƠN HÀNG', exact: true })).toBeTruthy();
  });
  it.each(['/admin/employees', '/staff/orders'])('does not mount employee modules at %s on User', async (path) => {
    vi.mocked(useAuth).mockReturnValue(auth('admin'));
    window.history.replaceState({}, '', path);
    render(<App />);
    expect(screen.queryByRole('navigation', { name: 'Khu vực quản lý' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
  });
  it('does not mount customer routes in the management portal', async () => {
    window.history.replaceState({}, '', '/orders');
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập nhân viên' })).toBeTruthy();
    expect(api.getCustomerOrders).not.toHaveBeenCalled();
  });
});

describe('Employee login destinations', () => {
  it.each([
    ['manager', '/admin/products', '/admin/products'],
    ['manager', '/admin/employees', '/admin/orders'],
    ['admin', '/admin/employees', '/admin/employees'],
  ] as const)('returns verified %s to an allowed local destination (%s)', async (role, from, destination) => {
    const session = auth(role);
    session.employee = null;
    session.employeeLogin.mockImplementation(() => { session.employee = auth(role).employee; });
    session.refreshEmployeeProfile.mockResolvedValue(auth(role).employee);
    vi.mocked(useAuth).mockImplementation(() => session);
    vi.spyOn(api, 'employeeLogin').mockResolvedValue({ access_token: 'employee-token', token_type: 'Bearer', expires_in: 3600, employee: auth(role).employee! });
    window.history.replaceState({ usr: { from: { pathname: from, search: '?test=1', hash: '#section' } } }, '', '/employee/login');
    render(<AdminApp />);
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
});

describe('Portal URLs', () => {
  it.each([['user', 5173], ['admin', 5175]] as const)('defaults %s to its port on the current host', (portal, port) => {
    expect(getPortalUrl(portal, {}, 'http://192.168.1.25:1234')).toBe(`http://192.168.1.25:${port}`);
    expect(getPortalUrl(portal, {}, 'https://[::1]:1234')).toBe(`https://[::1]:${port}`);
  });
  it.each([['user', 'VITE_USER_PORTAL_URL'], ['admin', 'VITE_ADMIN_PORTAL_URL']] as const)('uses the configured %s URL', (portal, key) => {
    expect(getPortalUrl(portal, { [key]: 'https://portal.example.test/' }, 'http://localhost:5173')).toBe('https://portal.example.test');
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('User portal separation', () => {
  it('keeps employee sign-in entry points off the storefront', () => {
    render(<App />);
    expect(screen.queryByRole('link', { name: 'Đăng nhập nhân viên' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cổng quản trị' })).toBeNull();
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
    await waitFor(() => expect(screen.getByRole('heading', { name: 'WELCOME BACK', exact: true })).toBeTruthy());
    expect(employeeProfile).not.toHaveBeenCalled();
  });
  it('does not restore a customer token in the management portal', async () => {
    window.localStorage.setItem('customer_token', 'customer-token');
    const customerProfile = vi.spyOn(api, 'getCustomerProfile').mockResolvedValue({ customerId: 2, name: 'Customer', email: 'customer@example.test' });
    render(<AdminApp />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đăng nhập nhân viên' })).toBeTruthy());
    expect(customerProfile).not.toHaveBeenCalled();
  });
});
