import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { api } from '../src/services/api';
import { request } from '../src/services/http';

describe('API token ownership', () => {
  let requests: { path: string; authorization: string | null }[];

  beforeEach(() => {
    requests = [];
    localStorage.setItem('customer_token', 'customer-session');
    localStorage.setItem('employee_token', 'employee-session');
    // Replace only the network boundary; API method and HTTP token lookup stay real.
    vi.stubGlobal('fetch', async (url: URL, options: RequestInit) => {
      requests.push({ path: url.pathname, authorization: new Headers(options.headers).get('Authorization') });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses customer_token for customer API calls', async () => {
    await api.getCustomerProfile();
    expect(requests).toEqual([{ path: '/auth/customer/profile', authorization: 'Bearer customer-session' }]);
  });

  it('uses employee_token for employee API calls', async () => {
    await api.getEmployeeProfile();
    expect(requests).toEqual([{ path: '/auth/employee/profile', authorization: 'Bearer employee-session' }]);
  });

  it.each(['customer', 'employee'] as const)('does not fall back to the other actor token when %s is absent', async (owner) => {
    localStorage.removeItem(`${owner}_token`);
    await request('/auth/profile', { tokenOwner: owner });
    expect(requests).toEqual([{ path: '/auth/profile', authorization: null }]);
  });

  it('omits actor tokens from public storefront calls', async () => {
    await api.getCategories();
    expect(requests).toEqual([{ path: '/store/categories', authorization: null }]);
  });
});
