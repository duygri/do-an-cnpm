import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { HttpError } from '../../services/http';
import {
  AdminOrder,
  AdminOrderSummary,
  InvoiceSummary,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../types';

const PAGE_LIMIT = 20;
type StatusFilter = 'all' | OrderStatus;
type PackingType = 'bag' | 'box' | '';

function formatPrice(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusLabel(status: OrderStatus): string {
  if (status === 'pending') return 'Chờ xử lý';
  if (status === 'packed') return 'Đã đóng gói';
  return 'Đã hủy';
}

function paymentLabel(status: PaymentStatus): string {
  return status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
}

function methodLabel(method: PaymentMethod): string {
  return method === 'payos' ? 'PayOS' : 'COD';
}

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    const prefix = error.status === 401
      ? 'Phiên nhân viên không còn hợp lệ (401).'
      : error.status === 403
        ? 'Tài khoản không có quyền xem hoặc xử lý đơn hàng (403).'
        : error.status === 409
          ? 'Đơn hàng đã thay đổi hoặc không còn hợp lệ để thực hiện thao tác (409).'
          : `Máy chủ trả về lỗi ${error.status}.`;
    return `${prefix} ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

function orderStateClass(status: OrderStatus): string {
  if (status === 'pending') return 'bg-warning-soft text-warning';
  if (status === 'packed') return 'bg-info-soft text-info';
  return 'bg-destructive-soft text-destructive';
}

function paymentStateClass(status: PaymentStatus): string {
  return status === 'paid' ? 'text-success' : 'text-warning';
}

export const AdminOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listRetry, setListRetry] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [packingType, setPackingType] = useState<PackingType>('');
  const [packingNote, setPackingNote] = useState('');
  const [actionLoading, setActionLoading] = useState<'pack' | 'paid' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const invoiceRequest = useRef(0);
  const selectedOrderIdRef = useRef<number | null>(selectedOrderId);
  selectedOrderIdRef.current = selectedOrderId;

  const loadOrders = useCallback(async () => {
    const requestId = ++listRequest.current;
    setListLoading(true);
    setListError(null);
    try {
      const result = await api.getAdminOrders({
        page,
        limit: PAGE_LIMIT,
        ...(filter === 'all' ? {} : { status: filter }),
      });
      if (requestId !== listRequest.current) return;
      setOrders(result.items);
      setTotal(result.total);
      if (result.items.length === 0 && result.page > 1 && (result.page - 1) * result.limit >= result.total) {
        setPage(Math.max(1, result.page - 1));
      }
    } catch (error) {
      if (requestId === listRequest.current) {
        setListError(errorText(error));
        setOrders([]);
        setTotal(0);
      }
    } finally {
      if (requestId === listRequest.current) setListLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void loadOrders(); }, [loadOrders, listRetry]);

  useEffect(() => {
    // Invalidate any receipt request for the previous selection and release its loading UI.
    // Its guarded finally block will intentionally ignore stale responses after this point.
    invoiceRequest.current += 1;
    setInvoiceLoading(false);

    if (selectedOrderId === null) {
      setOrder(null);
      setDetailError(null);
      return;
    }

    let current = true;
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError(null);
    setActionError(null);
    setInvoice(null);
    setInvoiceError(null);
    setPackingType('');
    setPackingNote('');

    void api.getAdminOrder(selectedOrderId)
      .then((result) => {
        if (current && requestId === detailRequest.current) setOrder(result);
      })
      .catch((error: unknown) => {
        if (current && requestId === detailRequest.current) {
          setOrder(null);
          setDetailError(errorText(error));
        }
      })
      .finally(() => {
        if (current && requestId === detailRequest.current) setDetailLoading(false);
      });

    return () => { current = false; };
  }, [selectedOrderId, detailRetry]);

  const runPack = async () => {
    if (!order || order.status !== 'pending' || actionLoading) return;
    if (order.paymentMethod === 'payos' && order.paymentStatus !== 'paid') return;
    setActionError(null);
    setActionLoading('pack');
    try {
      const updated = await api.packAdminOrder(order.orderId, {
        packingType: packingType || null,
        note: packingNote.trim() || null,
      });
      if (selectedOrderIdRef.current === order.orderId) {
        setOrder(updated);
        setInvoice(null);
        setInvoiceError(null);
      }
      setListRetry((value) => value + 1);
    } catch (error) {
      if (selectedOrderIdRef.current === order.orderId) setActionError(errorText(error));
      if (selectedOrderIdRef.current === order.orderId && error instanceof HttpError && error.status === 409) {
        setDetailRetry((value) => value + 1);
        setListRetry((value) => value + 1);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const runMarkPaid = async () => {
    if (!order || order.paymentMethod !== 'cod' || order.paymentStatus !== 'unpaid' || order.status !== 'packed' || actionLoading) return;
    if (!window.confirm(`Xác nhận đã nhận đủ tiền COD cho đơn #${order.orderId}?`)) return;
    setActionError(null);
    setActionLoading('paid');
    try {
      const updated = await api.markAdminOrderPaid(order.orderId);
      if (selectedOrderIdRef.current === order.orderId) {
        setOrder(updated);
        setInvoice(null);
        setInvoiceError(null);
      }
      setListRetry((value) => value + 1);
    } catch (error) {
      if (selectedOrderIdRef.current === order.orderId) setActionError(errorText(error));
      if (selectedOrderIdRef.current === order.orderId && error instanceof HttpError && error.status === 409) {
        setDetailRetry((value) => value + 1);
        setListRetry((value) => value + 1);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const loadInvoice = async () => {
    if (!order || order.paymentStatus !== 'paid' || invoiceLoading) return;
    const requestId = ++invoiceRequest.current;
    setInvoiceLoading(true);
    setInvoiceError(null);
    setInvoice(null);
    try {
      const result = await api.getAdminInvoice(order.orderId);
      if (requestId === invoiceRequest.current && selectedOrderIdRef.current === order.orderId) setInvoice(result);
    } catch (error) {
      if (requestId === invoiceRequest.current && selectedOrderIdRef.current === order.orderId) setInvoiceError(errorText(error));
    } finally {
      if (requestId === invoiceRequest.current && selectedOrderIdRef.current === order.orderId) setInvoiceLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const canPack = order?.status === 'pending'
    && !(order.paymentMethod === 'payos' && order.paymentStatus !== 'paid');
  const canMarkPaid = order?.paymentMethod === 'cod'
    && order.paymentStatus === 'unpaid'
    && order.status === 'packed';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-sans text-label-sm font-semibold uppercase tracking-[0.14em] text-primary">Vận hành</p>
          <h1 className="mt-1 font-sans text-headline-lg font-bold text-on-surface">Đơn hàng</h1>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Dữ liệu, trạng thái và thao tác được xác nhận từ máy chủ.</p>
        </div>
        <button type="button" onClick={() => setListRetry((value) => value + 1)} disabled={listLoading} className="rounded-lg border border-outline-variant bg-surface px-4 py-2.5 font-sans text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50">
          {listLoading ? 'Đang tải…' : 'Tải lại'}
        </button>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái đơn hàng">
        {([
          ['all', 'Tất cả'],
          ['pending', 'Chờ xử lý'],
          ['packed', 'Đã đóng gói'],
          ['cancelled', 'Đã hủy'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => { setFilter(value); setPage(1); }}
            className={`rounded-full px-4 py-2 font-sans text-label-sm font-semibold transition ${filter === value ? 'bg-primary text-on-primary' : 'border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {listError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-surface p-4 text-destructive">
          <p className="font-sans text-body-sm">{listError}</p>
          <button type="button" onClick={() => setListRetry((value) => value + 1)} className="rounded-lg border border-destructive/30 px-3 py-2 font-sans text-label-sm font-semibold hover:bg-destructive-soft">Thử lại</button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-sans text-headline-sm font-bold text-on-surface">Danh sách đơn</h2>
              {!listLoading && !listError && <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Trang {page} / {totalPages} · {total} kết quả từ máy chủ</p>}
            </div>
            <span className="material-symbols-outlined text-primary" aria-hidden="true">receipt_long</span>
          </div>

          {listLoading && orders.length === 0 && <p role="status" className="p-8 text-center font-sans text-body-sm text-on-surface-variant">Đang tải đơn hàng…</p>}
          {!listLoading && !listError && orders.length === 0 && (
            <div className="p-8 text-center">
              <p className="font-sans text-label-md font-semibold text-on-surface">Không có đơn hàng trong trạng thái này</p>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Khi máy chủ có đơn phù hợp, đơn sẽ xuất hiện ở đây.</p>
            </div>
          )}
          {orders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[630px] text-left">
                <thead className="bg-surface-container-low font-sans text-label-xs uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Đơn / người nhận</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Thanh toán</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Tổng tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {orders.map((item) => (
                    <tr key={item.orderId} className={selectedOrderId === item.orderId ? 'bg-primary-container/40' : 'hover:bg-surface-container-low'}>
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => setSelectedOrderId(item.orderId)} aria-pressed={selectedOrderId === item.orderId} className="text-left">
                          <span className="block font-mono text-sm font-bold text-primary">#{item.orderId}</span>
                          <span className="mt-1 block max-w-[220px] truncate font-sans text-label-sm font-semibold text-on-surface">{item.recipientName}</span>
                          <span className="mt-1 block font-sans text-body-xs text-on-surface-variant">{formatDate(item.orderDate)} · {item.detailCount} dòng</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${orderStateClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                      <td className="px-4 py-3.5">
                        <span className={`block font-sans text-label-sm font-semibold ${paymentStateClass(item.paymentStatus)}`}>{paymentLabel(item.paymentStatus)}</span>
                        <span className="mt-1 block font-sans text-body-xs text-on-surface-variant">{item.voucherCode ? `Voucher ${item.voucherCode}` : 'Không dùng voucher'}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-sans text-label-sm font-bold text-on-surface">{formatPrice(item.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3 sm:px-5">
            <span className="font-sans text-body-xs text-on-surface-variant">Tối đa {PAGE_LIMIT} đơn mỗi trang</span>
            <div className="flex gap-2">
              <button type="button" disabled={listLoading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm disabled:cursor-not-allowed disabled:opacity-40">Trước</button>
              <button type="button" disabled={listLoading || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm disabled:cursor-not-allowed disabled:opacity-40">Sau</button>
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-outline-variant bg-surface shadow-sm 2xl:sticky 2xl:top-5">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 className="font-sans text-headline-sm font-bold text-on-surface">Chi tiết đơn</h2>
            <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Chọn một đơn để xem người nhận, địa chỉ và sản phẩm.</p>
          </div>

          {selectedOrderId === null && <p className="p-8 text-center font-sans text-body-sm text-on-surface-variant">Chưa chọn đơn hàng.</p>}
          {detailLoading && <p role="status" className="p-8 text-center font-sans text-body-sm text-on-surface-variant">Đang tải chi tiết đơn #{selectedOrderId}…</p>}
          {detailError && (
            <div className="p-5">
              <p role="alert" className="rounded-lg bg-destructive-soft p-3 font-sans text-body-sm text-destructive">{detailError}</p>
              <button type="button" onClick={() => setDetailRetry((value) => value + 1)} className="mt-3 rounded-lg border border-outline-variant px-4 py-2 font-sans text-label-sm font-semibold">Tải lại chi tiết</button>
            </div>
          )}

          {!detailLoading && !detailError && order && (
            <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-lg font-bold text-primary">Đơn #{order.orderId}</p>
                  <p className="mt-1 font-sans text-body-xs text-on-surface-variant">{formatDate(order.orderDate)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${orderStateClass(order.status)}`}>{statusLabel(order.status)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.paymentStatus === 'paid' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{paymentLabel(order.paymentStatus)}</span>
                </div>
              </div>

              <section>
                <h3 className="font-sans text-label-md font-bold text-on-surface">Thông tin nhận hàng</h3>
                <dl className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-surface-container-low p-4 sm:grid-cols-2">
                  <div><dt className="font-sans text-label-xs text-on-surface-variant">Người nhận</dt><dd className="mt-1 font-sans text-body-sm font-semibold text-on-surface">{order.recipientName}</dd></div>
                  <div><dt className="font-sans text-label-xs text-on-surface-variant">Điện thoại</dt><dd className="mt-1 font-sans text-body-sm font-semibold text-on-surface">{order.recipientPhone}</dd></div>
                  <div className="sm:col-span-2"><dt className="font-sans text-label-xs text-on-surface-variant">Địa chỉ</dt><dd className="mt-1 whitespace-pre-wrap font-sans text-body-sm text-on-surface">{order.shippingAddress}</dd></div>
                  {order.note && <div className="sm:col-span-2"><dt className="font-sans text-label-xs text-on-surface-variant">Ghi chú của khách</dt><dd className="mt-1 whitespace-pre-wrap font-sans text-body-sm text-on-surface">{order.note}</dd></div>}
                </dl>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-sans text-label-md font-bold text-on-surface">Sản phẩm ({order.details.length})</h3>
                  <span className="font-sans text-body-xs text-on-surface-variant">{methodLabel(order.paymentMethod)}</span>
                </div>
                <div className="mt-3 divide-y divide-outline-variant rounded-xl border border-outline-variant px-4">
                  {order.details.map((line) => (
                    <article key={`${line.orderId}-${line.variantId}`} className="py-3 first:pt-4 last:pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-sans text-label-sm font-semibold text-on-surface">{line.productName}</p>
                          <p className="mt-1 font-sans text-body-xs text-on-surface-variant">{[line.color, line.size ? `Cỡ ${line.size}` : null].filter(Boolean).join(' · ') || `Biến thể #${line.variantId}`}</p>
                          <p className="mt-1 font-sans text-body-xs text-on-surface-variant">{line.quantity} × {formatPrice(line.unitPrice)}</p>
                        </div>
                        <span className="whitespace-nowrap font-sans text-label-sm font-bold text-on-surface">{formatPrice(line.subtotal)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-xl bg-surface-container-low p-4">
                <h3 className="font-sans text-label-md font-bold text-on-surface">Thanh toán</h3>
                <dl className="mt-3 space-y-2 font-sans text-body-sm">
                  <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Giảm giá{order.voucherCode ? ` · ${order.voucherCode}` : ''}</dt><dd className="font-semibold text-on-surface">−{formatPrice(order.discountAmount)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Phí giao hàng</dt><dd className="font-semibold text-on-surface">{formatPrice(order.shippingFee)}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-outline-variant pt-2 font-sans text-label-md"><dt className="font-semibold text-on-surface">Tổng thanh toán</dt><dd className="font-bold text-primary">{formatPrice(order.totalAmount)}</dd></div>
                  {order.paymentConfirmedAt && <div className="border-t border-outline-variant pt-2"><dt className="text-on-surface-variant">Đã xác nhận thanh toán lúc</dt><dd className="mt-1 font-semibold text-on-surface">{formatDate(order.paymentConfirmedAt)}</dd></div>}
                </dl>
                {order.paymentMethod === 'payos' && order.paymentStatus === 'unpaid' && (
                  <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-3 font-sans text-body-xs text-on-surface">
                    PayOS chưa xác nhận thanh toán. Không thể đóng gói hoặc xác nhận đã trả tại màn hình này; trạng thái chỉ được cập nhật qua đối soát của máy chủ.
                  </p>
                )}
                {order.paymentAttentionRequired && (
                  <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive-soft p-3 font-sans text-body-xs text-destructive">
                    <p className="font-semibold">Thanh toán cần nhân viên rà soát.</p>
                    {order.paymentAttempt?.reconciliationReason && <p className="mt-1">{order.paymentAttempt.reconciliationReason}</p>}
                    {order.paymentAttempt?.providerReference && <p className="mt-1">Mã tham chiếu: {order.paymentAttempt.providerReference}</p>}
                    {order.paymentAttempt?.observedAmountPaid && <p className="mt-1">Số tiền PayOS báo: {formatPrice(order.paymentAttempt.observedAmountPaid)}</p>}
                    {order.paymentAttempt?.checkoutUrlMissing && <p className="mt-1">Máy chủ chưa có URL thanh toán khả dụng.</p>}
                  </div>
                )}
              </section>

              {order.packing && (
                <section className="rounded-xl border border-outline-variant p-4">
                  <h3 className="font-sans text-label-md font-bold text-on-surface">Đóng gói</h3>
                  <p className="mt-2 font-sans text-body-sm text-on-surface-variant">{formatDate(order.packing.packingDate)} · {order.packing.packingType === 'bag' ? 'Túi' : order.packing.packingType === 'box' ? 'Hộp' : 'Không ghi loại bao bì'}</p>
                  {order.packing.note && <p className="mt-1 whitespace-pre-wrap font-sans text-body-sm text-on-surface">{order.packing.note}</p>}
                </section>
              )}

              {actionError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive-soft p-3 font-sans text-body-sm text-destructive">{actionError}</p>}

              {canPack && (
                <section className="space-y-3 rounded-xl border border-primary/20 bg-primary-container/20 p-4">
                  <div>
                    <h3 className="font-sans text-label-md font-bold text-on-surface">Đóng gói đơn</h3>
                    <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Thao tác này chuyển đơn pending sang packed sau khi máy chủ xác nhận.</p>
                  </div>
                  <label className="block font-sans text-label-sm font-semibold text-on-surface">
                    Loại đóng gói <span className="font-normal text-on-surface-variant">(không bắt buộc)</span>
                    <select value={packingType} onChange={(event) => setPackingType(event.target.value as PackingType)} className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-sans text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="">Không ghi loại</option>
                      <option value="bag">Túi</option>
                      <option value="box">Hộp</option>
                    </select>
                  </label>
                  <label className="block font-sans text-label-sm font-semibold text-on-surface">
                    Ghi chú đóng gói <span className="font-normal text-on-surface-variant">(không bắt buộc)</span>
                    <textarea value={packingNote} onChange={(event) => setPackingNote(event.target.value)} maxLength={1000} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-sans text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Ghi chú cho nhân viên đóng gói" />
                  </label>
                  <button type="button" onClick={() => void runPack()} disabled={actionLoading !== null} className="w-full rounded-lg bg-primary px-4 py-3 font-sans text-label-sm font-bold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                    {actionLoading === 'pack' ? 'Đang gửi yêu cầu…' : 'Xác nhận đã đóng gói'}
                  </button>
                </section>
              )}

              {canMarkPaid && (
                <section className="space-y-3 rounded-xl border border-success/20 bg-success-soft/50 p-4">
                  <div>
                    <h3 className="font-sans text-label-md font-bold text-on-surface">Xác nhận thu COD</h3>
                    <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Chỉ xác nhận sau khi nhân viên đã thu tiền từ người nhận.</p>
                  </div>
                  <button type="button" onClick={() => void runMarkPaid()} disabled={actionLoading !== null} className="w-full rounded-lg bg-success px-4 py-3 font-sans text-label-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                    {actionLoading === 'paid' ? 'Đang xác nhận…' : 'Đã thu tiền COD'}
                  </button>
                </section>
              )}

              {order.status === 'pending' && order.paymentMethod === 'payos' && order.paymentStatus === 'unpaid' && (
                <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 font-sans text-body-sm text-on-surface">Chưa thể đóng gói đơn PayOS chưa thanh toán.</p>
              )}

              {order.paymentStatus === 'paid' && (
                <section className="rounded-xl border border-outline-variant p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-sans text-label-md font-bold text-on-surface">Biên nhận nội bộ</h3>
                      <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Biên nhận MVP, không phải hóa đơn thuế.</p>
                    </div>
                    {!invoice && <button type="button" onClick={() => void loadInvoice()} disabled={invoiceLoading} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50">{invoiceLoading ? 'Đang tải…' : 'Tải biên nhận'}</button>}
                  </div>
                  {invoiceError && <p role="alert" className="mt-3 rounded-lg bg-destructive-soft p-3 font-sans text-body-xs text-destructive">{invoiceError}</p>}
                  {invoice && <dl className="mt-3 grid grid-cols-2 gap-3 font-sans text-body-xs"><div><dt className="text-on-surface-variant">Mã biên nhận</dt><dd className="mt-1 font-mono font-semibold text-on-surface">#{invoice.invoiceId}</dd></div><div><dt className="text-on-surface-variant">Ngày lập</dt><dd className="mt-1 font-semibold text-on-surface">{formatDate(invoice.issuedDate)}</dd></div><div><dt className="text-on-surface-variant">Trạng thái</dt><dd className="mt-1 font-semibold text-on-surface">{invoice.status}</dd></div><div><dt className="text-on-surface-variant">Tổng tiền</dt><dd className="mt-1 font-semibold text-on-surface">{formatPrice(invoice.totalAmount)}</dd></div></dl>}
                </section>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
