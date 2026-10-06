import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminOrdersPage } from '../src/pages/admin/AdminOrdersPage';
import { AdminPurchasingPage } from '../src/pages/admin/AdminPurchasingPage';
import { api } from '../src/services/api';
import type { AdminOrder, AdminOrderSummary, ImportRecord, InvoiceSummary, Supplier } from '../src/types';

const orderSummary: AdminOrderSummary = {
  orderId: 41,
  orderDate: '2026-10-07T10:00:00.000Z',
  customerId: 3,
  recipientName: 'Nguyễn An',
  status: 'pending',
  paymentStatus: 'unpaid',
  voucherCode: null,
  discountAmount: '0.00',
  totalAmount: '250000.00',
  detailCount: 1,
};

const makeOrder = (overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  ...orderSummary,
  recipientPhone: '0900000000',
  shippingAddress: 'TP. Hồ Chí Minh',
  shippingFee: '0.00',
  paymentMethod: 'cod',
  note: null,
  paymentConfirmedAt: null,
  paymentConfirmedByEmployeeId: null,
  paymentAttentionRequired: false,
  paymentAttempt: null,
  details: [{
    orderId: 41, variantId: 9, quantity: 1, unitPrice: '250000.00', subtotal: '250000.00',
    productName: 'Áo thun Indigo', size: 'M', color: 'Xanh',
  }],
  packing: null,
  ...overrides,
});

const supplier: Supplier = { supplierId: 12, name: 'Nhà cung cấp vải', address: null, email: null };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('React Admin custom workflows', () => {
  it('packs a COD order, confirms collection, then loads its internal receipt', async () => {
    const pendingOrder = makeOrder();
    const packedOrder = makeOrder({
      status: 'packed',
      packing: { packingId: 14, packingDate: '2026-10-07T10:10:00.000Z', packingType: 'box', status: 'packed', note: 'Đóng gói chắc chắn', employeeId: 2 },
    });
    const paidOrder = makeOrder({ ...packedOrder, paymentStatus: 'paid', paymentConfirmedAt: '2026-10-07T10:20:00.000Z' });
    const invoice: InvoiceSummary = { invoiceId: 16, orderId: 41, issuedDate: '2026-10-07T10:20:00.000Z', totalAmount: '250000.00', status: 'issued' };

    vi.spyOn(api, 'getAdminOrders').mockResolvedValue({ items: [orderSummary], page: 1, limit: 20, total: 1 });
    vi.spyOn(api, 'getAdminOrder').mockResolvedValue(pendingOrder);
    const pack = vi.spyOn(api, 'packAdminOrder').mockResolvedValue(packedOrder);
    const markPaid = vi.spyOn(api, 'markAdminOrderPaid').mockResolvedValue(paidOrder);
    const getInvoice = vi.spyOn(api, 'getAdminInvoice').mockResolvedValue(invoice);
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<AdminOrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /#41/ }));
    fireEvent.change(await screen.findByLabelText(/Loại đóng gói/), { target: { value: 'box' } });
    fireEvent.change(screen.getByLabelText(/Ghi chú đóng gói/), { target: { value: 'Đóng gói chắc chắn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã đóng gói' }));

    await waitFor(() => expect(pack).toHaveBeenCalledWith(41, { packingType: 'box', note: 'Đóng gói chắc chắn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đã thu tiền COD' }));
    await waitFor(() => expect(markPaid).toHaveBeenCalledWith(41));
    fireEvent.click(await screen.findByRole('button', { name: 'Tải biên nhận' }));

    expect(await screen.findByText('#16')).toBeTruthy();
    expect(getInvoice).toHaveBeenCalledWith(41);
  });

  it('does not allow staff to pack an unpaid PayOS order', async () => {
    const payosOrder = makeOrder({ paymentMethod: 'payos' });
    vi.spyOn(api, 'getAdminOrders').mockResolvedValue({ items: [orderSummary], page: 1, limit: 20, total: 1 });
    vi.spyOn(api, 'getAdminOrder').mockResolvedValue(payosOrder);
    const pack = vi.spyOn(api, 'packAdminOrder');

    render(<AdminOrdersPage />);
    fireEvent.click(await screen.findByRole('button', { name: /#41/ }));

    expect(await screen.findByText('Chưa thể đóng gói đơn PayOS chưa thanh toán.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận đã đóng gói' })).toBeNull();
    expect(pack).not.toHaveBeenCalled();
  });

  it('creates an import record with validated detail data and shows the server result', async () => {
    const created: ImportRecord = {
      importId: 29,
      importDate: '2026-10-07T11:00:00.000Z',
      totalAmount: '37500.00',
      note: null,
      supplierId: supplier.supplierId,
      employeeId: 2,
      supplier,
      details: [{ importId: 29, variantId: 91, quantity: 3, unitPrice: '12500.00', subtotal: '37500.00' }],
    };
    vi.spyOn(api, 'getSuppliers').mockResolvedValue([supplier]);
    vi.spyOn(api, 'getImports').mockResolvedValue([]);
    vi.spyOn(api, 'getImport').mockResolvedValue(created);
    vi.spyOn(api, 'getStoreProducts').mockResolvedValue({ items: [], page: 1, limit: 100, total: 0 });
    const createImport = vi.spyOn(api, 'createImport').mockResolvedValue(created);

    render(<AdminPurchasingPage section="imports" />);
    fireEvent.click(await screen.findByRole('button', { name: /Tạo phiếu nhập/ }));
    fireEvent.change(screen.getByLabelText(/Mã biến thể/), { target: { value: '91' } });
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Đơn giá mua/), { target: { value: '12500.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phiếu nhập' }));

    await waitFor(() => expect(createImport).toHaveBeenCalledWith({
      supplierId: supplier.supplierId,
      note: null,
      details: [{ variantId: 91, quantity: 3, unitPrice: '12500.00' }],
    }));
    expect(await screen.findByText('Phiếu nhập #29')).toBeTruthy();
    expect(screen.getByText('37.500,00 ₫')).toBeTruthy();
  });
});
