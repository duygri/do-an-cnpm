import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider, useCart } from '../src/context/CartContext';
import { api } from '../src/services/api';
import type { CustomerProfile } from '../src/types';

const customerA: CustomerProfile = {
  customerId: 1,
  name: 'Customer A',
  email: 'a@example.test',
};

const customerB: CustomerProfile = {
  customerId: 2,
  name: 'Customer B',
  email: 'b@example.test',
};

const guestItem = {
  productId: 10,
  variantId: 101,
  name: 'Guest shirt',
  size: 'M',
  color: 'Blue',
  price: '100.00',
};

const customerItem = {
  productId: 20,
  variantId: 202,
  name: 'Saved shirt',
  size: 'L',
  color: 'Black',
  price: '200.00',
  quantity: 3,
};

const employeeA = {
  employeeId: 11,
  name: 'Employee A',
  email: 'employee-a@example.test',
  phone: null,
  position: 'catalog',
  role: 'catalog_manager' as const,
  status: 'active' as const,
};

function jwtFor(subject: number): string {
  const payload = btoa(JSON.stringify({ sub: String(subject) }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `e30.${payload}.signature`;
}

function Probe() {
  const auth = useAuth();
  const cart = useCart();

  return (
    <>
      <p data-testid="customer">{auth.customer ? `${auth.customer.customerId}:${auth.customer.name}` : 'guest'}</p>
      <p data-testid="cart-count">{cart.totalCount}</p>
      <button type="button" onClick={() => cart.addToCart(guestItem, 2)}>Add guest item</button>
      <button type="button" onClick={() => auth.customerLogin('token-b', customerB)}>Log in as B</button>
      <button type="button" onClick={() => auth.customerLogout()}>Log out</button>
    </>
  );
}

function renderContexts() {
  return render(
    <AuthProvider scope="customer">
      <CartProvider><Probe /></CartProvider>
    </AuthProvider>,
  );
}

function EmployeeProbe() {
  const auth = useAuth();
  return <p data-testid="employee">{auth.employee ? `${auth.employee.employeeId}:${auth.employee.name}` : 'signed out'}</p>;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('customer session and cart lifecycle', () => {
  it('refreshes the customer after another tab replaces the stored session', async () => {
    window.localStorage.setItem('customer_profile', JSON.stringify(customerA));
    window.localStorage.setItem('customer_token', 'token-a');
    vi.spyOn(api, 'getCustomerProfile')
      .mockResolvedValueOnce(customerA)
      .mockResolvedValueOnce(customerB);

    renderContexts();
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('1:Customer A'));

    // The other tab writes both parts of its new session before the browser
    // delivers the token's storage event to this tab.
    window.localStorage.setItem('customer_profile', JSON.stringify(customerB));
    window.localStorage.setItem('customer_token', 'token-b');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'customer_token',
      oldValue: 'token-a',
      newValue: 'token-b',
      storageArea: window.localStorage,
    }));

    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(api.getCustomerProfile).toHaveBeenCalledTimes(2);
  });

  it('merges a guest cart into the signed-in customer cart and consumes the guest cart', async () => {
    renderContexts();
    fireEvent.click(screen.getByRole('button', { name: 'Add guest item' }));
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('2'));

    window.localStorage.setItem('indigo_cart_v2:customer-2', JSON.stringify([customerItem]));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));

    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('5'));
    expect(window.localStorage.getItem('indigo_cart_v2:guest')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-2')!)).toEqual([
      customerItem,
      { ...guestItem, quantity: 2 },
    ]);
  });

  it('consumes the guest handoff after retrying a failed customer-cart write', async () => {
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    renderContexts();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('4'));

    const originalSetItem = Storage.prototype.setItem;
    let customerWriteFailed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'indigo_cart_v2:customer-2' && !customerWriteFailed) {
        customerWriteFailed = true;
        throw new DOMException('Storage temporarily unavailable', 'QuotaExceededError');
      }
      originalSetItem.call(this, key, value);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-2')!)).toEqual([
      { ...guestItem, quantity: 4 },
    ]));
    expect(window.localStorage.getItem('indigo_cart_v2:guest')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('guest'));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest') ?? '[]')).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-2')!)).toEqual([
      { ...guestItem, quantity: 4 },
    ]);
  });

  it('keeps a guest handoff retryable while storage writes remain unavailable', async () => {
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    renderContexts();
    let storageUnavailable = true;
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'indigo_cart_v2:customer-2' && storageUnavailable) {
        throw new DOMException('Storage unavailable', 'QuotaExceededError');
      }
      originalSetItem.call(this, key, value);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    expect(window.localStorage.getItem('indigo_cart_v2:customer-2')).toBeNull();

    storageUnavailable = false;
    fireEvent.click(screen.getByRole('button', { name: 'Add guest item' }));
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('6'));
    expect(window.localStorage.getItem('indigo_cart_v2:guest')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('guest'));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('6');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest') ?? '[]')).toEqual([]);
  });

  it('retries guest cleanup after the merged customer cart was saved', async () => {
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    renderContexts();
    const originalRemoveItem = Storage.prototype.removeItem;
    let guestCleanupFailed = false;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
      if (key === 'indigo_cart_v2:guest' && !guestCleanupFailed) {
        guestCleanupFailed = true;
        throw new DOMException('Storage temporarily unavailable', 'SecurityError');
      }
      originalRemoveItem.call(this, key);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('guest'));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest') ?? '[]')).toEqual([]);
  });

  it('recovers a saved guest handoff before loading guest items after provider remount', async () => {
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    const originalRemoveItem = Storage.prototype.removeItem;
    let cleanupUnavailable = true;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
      if (key === 'indigo_cart_v2:guest' && cleanupUnavailable) {
        throw new DOMException('Guest cleanup unavailable', 'SecurityError');
      }
      originalRemoveItem.call(this, key);
    });

    const firstMount = renderContexts();
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('guest'));
    firstMount.unmount();

    cleanupUnavailable = false;
    renderContexts();
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest') ?? '[]')).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-2')!)).toEqual([
      { ...guestItem, quantity: 4 },
    ]);
  });

  it.each([false, true])('consumes the persisted guest snapshot after a failed guest write (reads unavailable: %s)', async (readsUnavailable) => {
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    renderContexts();
    const originalSetItem = Storage.prototype.setItem;
    const originalGetItem = Storage.prototype.getItem;
    let guestWritesUnavailable = true;
    let guestReadsUnavailable = false;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === 'indigo_cart_v2:guest' && guestReadsUnavailable) {
        throw new DOMException('Guest reads unavailable', 'SecurityError');
      }
      return originalGetItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'indigo_cart_v2:guest' && guestWritesUnavailable) {
        throw new DOMException('Guest writes unavailable', 'QuotaExceededError');
      }
      originalSetItem.call(this, key, value);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add guest item' }));
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('6'));
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest')!)).toEqual([
      { ...guestItem, quantity: 4 },
    ]);
    guestReadsUnavailable = readsUnavailable;
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('6');

    guestWritesUnavailable = false;
    guestReadsUnavailable = false;
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('guest'));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('6');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest') ?? '[]')).toEqual([]);
  });

  it('reconciles another tab handoff before adding to the mounted guest cart', async () => {
    const originalGuestSnapshot = JSON.stringify([{ ...guestItem, quantity: 4 }]);
    window.localStorage.setItem('indigo_cart_v2:guest', originalGuestSnapshot);
    renderContexts();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('4'));

    // Another tab saves the handoff atomically, but cannot remove the guest key.
    window.localStorage.setItem('indigo_cart_v2:customer-2', JSON.stringify({
      items: [{ ...guestItem, quantity: 4 }],
      guestHandoff: { guestSnapshot: originalGuestSnapshot },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Add guest item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('6');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest') ?? '[]')).toEqual([]);
  });

  it('merges the latest persisted guest cart when another tab changed it before login', async () => {
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    renderContexts();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('4'));

    // The storage event has not arrived in this tab yet.
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 6 }]));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));
    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('6');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-2')!)).toEqual([
      { ...guestItem, quantity: 6 },
    ]);
    expect(window.localStorage.getItem('indigo_cart_v2:guest')).toBeNull();
  });

  it('does not post checkout data when the stored customer differs from the checkout owner', async () => {
    window.localStorage.setItem('customer_profile', JSON.stringify(customerA));
    window.localStorage.setItem('customer_token', jwtFor(customerB.customerId));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.createOrder({
      recipientName: customerA.name,
      recipientPhone: '0900000000',
      shippingAddress: 'Customer A address',
      details: [{ variantId: 101, quantity: 1 }],
      paymentMethod: 'cod',
    }, { expectedCustomerId: customerA.customerId })).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts checkout data when the expected customer matches the stored profile and token', async () => {
    window.localStorage.setItem('customer_profile', JSON.stringify(customerB));
    window.localStorage.setItem('customer_token', jwtFor(customerB.customerId));
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.createOrder({
      recipientName: customerB.name,
      recipientPhone: '0900000000',
      shippingAddress: 'Customer B address',
      details: [{ variantId: 101, quantity: 1 }],
      paymentMethod: 'cod',
    }, { expectedCustomerId: customerB.customerId });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(`Bearer ${jwtFor(customerB.customerId)}`);
  });

  it('blocks an employee mutation when another tab changed the employee token before the storage event', async () => {
    window.localStorage.setItem('employee_profile', JSON.stringify(employeeA));
    window.localStorage.setItem('employee_token', jwtFor(employeeA.employeeId));
    const employeeB = { ...employeeA, employeeId: 22, name: 'Employee B', role: 'order_staff' as const };
    vi.spyOn(api, 'getEmployeeProfile')
      .mockResolvedValueOnce(employeeA)
      .mockResolvedValueOnce(employeeB);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider scope="employee"><EmployeeProbe /></AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('employee').textContent).toBe('11:Employee A'));

    window.localStorage.setItem('employee_profile', JSON.stringify(employeeB));
    window.localStorage.setItem('employee_token', jwtFor(22));
    await expect(api.createCategory({ name: 'A category' })).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'employee_token',
      oldValue: jwtFor(employeeA.employeeId),
      newValue: jwtFor(employeeB.employeeId),
      storageArea: window.localStorage,
    }));
    await waitFor(() => expect(screen.getByTestId('employee').textContent).toBe('22:Employee B'));
    await api.createCategory({ name: 'B category' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(`Bearer ${jwtFor(employeeB.employeeId)}`);
  });

  it('does not merge one authenticated customer cart into another account', async () => {
    window.localStorage.setItem('customer_profile', JSON.stringify(customerA));
    window.localStorage.setItem('customer_token', 'token-a');
    window.localStorage.setItem('indigo_cart_v2:customer-1', JSON.stringify([{ ...guestItem, quantity: 2 }]));
    window.localStorage.setItem('indigo_cart_v2:customer-2', JSON.stringify([customerItem]));
    window.localStorage.setItem('indigo_cart_v2:guest', JSON.stringify([{ ...guestItem, quantity: 4 }]));
    vi.spyOn(api, 'getCustomerProfile').mockResolvedValue(customerA);

    renderContexts();
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('2'));
    fireEvent.click(screen.getByRole('button', { name: 'Log in as B' }));

    await waitFor(() => expect(screen.getByTestId('customer').textContent).toBe('2:Customer B'));
    expect(screen.getByTestId('cart-count').textContent).toBe('3');
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-1')!)).toEqual([
      { ...guestItem, quantity: 2 },
    ]);
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:customer-2')!)).toEqual([customerItem]);
    expect(JSON.parse(window.localStorage.getItem('indigo_cart_v2:guest')!)).toEqual([
      { ...guestItem, quantity: 4 },
    ]);
  });
});
