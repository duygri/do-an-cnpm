import type { AuthProvider } from 'react-admin';
import { api } from '../services/api';
import { canAccessModule, EMPLOYEE_MODULES } from '../portals/employee-access';
import type { EmployeeProfile } from '../types';

export interface EmployeeAuthSession {
  employee: EmployeeProfile | null;
  employeeLoading: boolean;
  employeeLogin: (token: string, profile: EmployeeProfile) => void;
  employeeLogout: () => void;
  employeeClearSession?: () => void;
  refreshEmployeeProfile: () => Promise<EmployeeProfile | null>;
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = error as { status?: unknown; response?: { status?: unknown } };
  const status = value.status ?? value.response?.status;
  return typeof status === 'number' ? status : undefined;
}

const resourceModules: Record<string, string> = {
  categories: 'categories',
  products: 'products',
  productVariants: 'products',
  productImages: 'products',
  promotions: 'promotions',
  vouchers: 'promotions',
  suppliers: 'suppliers',
  imports: 'imports',
  orders: 'orders',
  employees: 'employees',
  revenue: 'revenue',
};

function redirectAfterLogin(returnTo: unknown, role: EmployeeProfile['role']): string {
  const firstAllowed = EMPLOYEE_MODULES.find((module) => canAccessModule(module.path, role))?.path ?? 'orders';
  const fallback = `/admin/${firstAllowed}`;
  if (typeof returnTo === 'string') {
    const [pathname, search = '', hash = ''] = returnTo.split(/(?=[?#])/u);
    if (pathname.startsWith('/admin/')) {
      const module = pathname.slice('/admin/'.length).split('/')[0];
      if (canAccessModule(module, role)) return `${pathname}${search}${hash}`;
    }
    return fallback;
  }
  if (typeof returnTo !== 'object' || returnTo === null) return fallback;
  const candidate = returnTo as { pathname?: unknown; search?: unknown; hash?: unknown };
  if (typeof candidate.pathname !== 'string' || !candidate.pathname.startsWith('/admin/')) return fallback;
  const module = candidate.pathname.slice('/admin/'.length).split('/')[0];
  if (!canAccessModule(module, role)) return fallback;
  const search = typeof candidate.search === 'string' ? candidate.search : '';
  const hash = typeof candidate.hash === 'string' ? candidate.hash : '';
  return `${candidate.pathname}${search}${hash}`;
}

export function createEmployeeAuthProvider(session: EmployeeAuthSession): AuthProvider {
  return {
    async login(params) {
      const email = typeof params?.email === 'string' ? params.email.trim() : '';
      const password = typeof params?.password === 'string' ? params.password : '';
      const response = await api.employeeLogin(email, password);
      session.employeeLogin(response.access_token, response.employee);
      const profile = await session.refreshEmployeeProfile();
      if (!profile) throw new Error('Không thể xác minh hồ sơ nhân viên. Vui lòng đăng nhập lại.');
      return { redirectTo: redirectAfterLogin(params?.returnTo, profile.role) };
    },

    async logout() {
      session.employeeLogout();
      return undefined;
    },

    async checkAuth() {
      if (session.employeeLoading) {
        const profile = await session.refreshEmployeeProfile();
        if (!profile) throw new Error('Vui lòng đăng nhập để tiếp tục.');
        return;
      }
      if (!session.employee) {
        const profile = await session.refreshEmployeeProfile();
        if (!profile) throw new Error('Vui lòng đăng nhập để tiếp tục.');
      }
    },

    async checkError(error) {
      if (statusCode(error) === 401) {
        const authSessionUpdated =
          typeof error === 'object' &&
          error !== null &&
          'authSessionUpdated' in error &&
          (error as { authSessionUpdated?: unknown }).authSessionUpdated === true;
        if (!authSessionUpdated) {
          if (session.employeeClearSession) session.employeeClearSession();
          else session.employeeLogout();
        }
        throw error;
      }
    },

    async getIdentity() {
      const employee = session.employee ?? await session.refreshEmployeeProfile();
      if (!employee) throw new Error('Không tìm thấy hồ sơ nhân viên.');
      return { id: employee.employeeId, fullName: employee.name, name: employee.name };
    },

    async canAccess({ resource, action }) {
      const module = resourceModules[resource];
      if (!module || !session.employee) return false;
      if (module === 'employees' || module === 'revenue') return canAccessModule(module, session.employee.role);
      return canAccessModule(module, session.employee.role) && Boolean(action);
    },
  };
}
