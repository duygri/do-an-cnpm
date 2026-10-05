import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../src/context/AuthContext';
import { useCart } from '../src/context/CartContext';
import { CartPage } from '../src/pages/storefront/CartPage';
import { api } from '../src/services/api';
import { HttpError } from '../src/services/http';

vi.mock('../src/context/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/context/AuthContext')>(),
  useAuth: vi.fn(),
}));

vi.mock('../src/context/CartContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/context/CartContext')>(),
  useCart: vi.fn(),
}));

const pendingAttempt = {
  key: 'previous-payos-idempotency-key',
  payload: {
    recipientName: 'Customer One',
    recipientPhone: '0900000000',
    shippingAddress: '1 Test Street',
    details: [{ variantId: 101, quantity: 1 }],
    paymentMethod: 'payos' as const,
  },
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem('indigo_pending_payos_order:1', JSON.stringify(pendingAttempt));
  vi.mocked(useAuth).mockReturnValue({
    customer: { customerId: 1, name: 'Customer One', email: 'one@example.test' },
    customerLoading: false,
  } as ReturnType<typeof useAuth>);
  vi.mocked(useCart).mockReturnValue({
    items: [{ productId: 10, variantId: 101, name: 'Shirt', size: 'M', color: 'Blue', price: '100.00', quantity: 1 }],
    totalCount: 1,
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    removeOrderedQuantities: vi.fn(() => true),
    refreshFromStorage: vi.fn(),
    validateOrderQuantities: vi.fn(() => 'valid'),
  } as ReturnType<typeof useCart>);
  vi.spyOn(api, 'createOrder').mockRejectedValue(new HttpError('Your signed-in account changed.', 409));
});

describe('PayOS attempt session protection', () => {
  it('keeps the unresolved idempotency key when a retry is blocked by local session validation', async () => {
    render(
      <MemoryRouter initialEntries={['/cart']}>
        <Routes><Route path="/cart" element={<CartPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thử lại đúng yêu cầu PayOS/ }));

    await waitFor(() => expect(api.createOrder).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText(/Your signed-in account changed/).textContent).toContain('Your signed-in account changed'));
    expect(window.sessionStorage.getItem('indigo_pending_payos_order:1')).toBe(JSON.stringify(pendingAttempt));
  });
});
