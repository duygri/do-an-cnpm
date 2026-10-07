import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { HttpError } from '../../services/http';
import { CustomerOrder, CustomerOrderSummary, PaginatedResult } from '../../types';

const PAGE_LIMIT = 10;

function formatPrice(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusLabel(status: CustomerOrderSummary['status']): string {
  if (status === 'pending') return 'Chờ xử lý';
  if (status === 'packed') return 'Đã đóng gói';
  return 'Đã hủy';
}

export const OrderHistoryPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedResult<CustomerOrderSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const listRequestSequence = useRef(0);
  const pageRef = useRef(page);
  pageRef.current = page;

  const loadOrders = useCallback(async () => {
    const requestSequence = ++listRequestSequence.current;
    const requestedPage = page;
    setLoading(true);
    setError(null);
    try {
      const response = await api.getCustomerOrders({ page: requestedPage, limit: PAGE_LIMIT });
      if (requestSequence !== listRequestSequence.current || pageRef.current !== requestedPage) return;
      setResult(response);
    } catch (reason) {
      if (requestSequence !== listRequestSequence.current || pageRef.current !== requestedPage) return;
      setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách đơn hàng.');
    } finally {
      if (requestSequence === listRequestSequence.current && pageRef.current === requestedPage) setLoading(false);
    }
  }, [page, retry]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const cancelOrder = async (order: CustomerOrderSummary) => {
    if (order.status !== 'pending' || cancellingOrderId !== null) return;
    const confirmed = window.confirm(`Gửi yêu cầu hủy đơn #${order.orderId}? Máy chủ sẽ kiểm tra trạng thái thanh toán trước khi quyết định.`);
    if (!confirmed) return;

    const requestedPage = page;
    const listSequenceAtStart = listRequestSequence.current;
    setCancellingOrderId(order.orderId);
    setCancelError(null);
    try {
      const updated: CustomerOrder = await api.cancelCustomerOrder(order.orderId);
      if (listSequenceAtStart !== listRequestSequence.current || pageRef.current !== requestedPage) return;
      setResult((current) => current ? {
        ...current,
        items: current.items.map((item) => item.orderId === updated.orderId
          ? { ...item, ...updated }
          : item),
      } : current);
    } catch (reason) {
      if (listSequenceAtStart !== listRequestSequence.current || pageRef.current !== requestedPage) return;
      const message = reason instanceof HttpError && reason.status === 409
        ? `${reason.message} Trạng thái đơn chưa thay đổi trên màn hình.`
        : reason instanceof Error ? reason.message : 'Không thể hủy đơn. Vui lòng thử lại.';
      setCancelError(message);
    } finally {
      setCancellingOrderId((current) => current === order.orderId ? null : current);
    }
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <div className="max-w-5xl mx-auto px-gutter py-8 sm:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-sans text-headline-lg font-bold text-on-surface">Đơn hàng của tôi</h1>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Trạng thái, phương thức thanh toán và số tiền lấy từ hệ thống đơn hàng.</p>
        </div>
        <Link to="/" className="self-start rounded-xl border border-outline-variant bg-surface px-4 py-2 font-sans text-label-md font-semibold text-on-surface hover:bg-surface-container-low">Tiếp tục mua sắm</Link>
      </div>

      {cancelError && <p role="alert" className="mb-4 rounded-xl bg-error-container px-4 py-3 font-sans text-body-sm text-on-error-container">{cancelError}</p>}
      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-surface p-8 text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-destructive">cloud_off</span>
          <h2 className="mt-3 font-sans text-headline-sm font-bold text-on-surface">Chưa tải được đơn hàng</h2>
          <p role="alert" className="mt-2 font-sans text-body-sm text-on-surface-variant">{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-5 rounded-lg bg-primary px-5 py-2.5 font-sans text-label-md font-semibold text-on-primary">Thử lại</button>
        </div>
      )}

      {loading && !error && <div role="status" className="rounded-2xl bg-surface p-10 text-center font-sans text-body-md text-on-surface-variant shadow-sm">Đang tải đơn hàng…</div>}

      {!loading && !error && result && result.items.length === 0 && (
        <div className="rounded-2xl bg-surface p-10 text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-outline">receipt_long</span>
          <h2 className="mt-3 font-sans text-headline-sm font-bold text-on-surface">Chưa có đơn hàng</h2>
          <p className="mt-2 font-sans text-body-sm text-on-surface-variant">Đơn hàng mới sẽ xuất hiện ở đây sau khi máy chủ ghi nhận.</p>
          <Link to="/" className="mt-5 inline-flex rounded-lg bg-primary px-5 py-2.5 font-sans text-label-md font-semibold text-on-primary">Khám phá sản phẩm</Link>
        </div>
      )}

      {!loading && !error && result && result.items.length > 0 && (
        <>
          <div className="space-y-4">
            {result.items.map((order) => (
              <article key={order.orderId} className="flex flex-col justify-between gap-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to={`/orders/${order.orderId}`} className="font-mono text-base font-bold text-primary hover:underline">Đơn #{order.orderId}</Link>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === 'pending' ? 'bg-warning-soft text-warning' : order.status === 'packed' ? 'bg-info-soft text-info' : 'bg-destructive-soft text-destructive'}`}>{statusLabel(order.status)}</span>
                    <time dateTime={order.orderDate} className="font-sans text-body-sm text-on-surface-variant">{formatDate(order.orderDate)}</time>
                  </div>
                  <p className="font-sans text-body-sm text-on-surface-variant">Người nhận: <span className="font-medium text-on-surface">{order.recipientName}</span></p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-sans text-body-sm text-on-surface-variant">
                    <span>Thanh toán: <strong className={order.paymentStatus === 'paid' ? 'text-success' : 'text-warning'}>{order.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}</strong> · {order.paymentMethod.toUpperCase()}</span>
                    {order.voucherCode && <span>Voucher: <strong className="text-on-surface">{order.voucherCode}</strong></span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <span className="font-sans text-xl font-bold text-primary">{formatPrice(order.totalAmount)}</span>
                  <div className="flex items-center gap-3">
                    {order.status === 'pending' && (
                      <button type="button" disabled={cancellingOrderId !== null} onClick={() => void cancelOrder(order)} className="rounded-lg border border-destructive/30 px-3 py-1.5 font-sans text-label-sm font-semibold text-destructive hover:bg-destructive-soft disabled:opacity-50">
                        {cancellingOrderId === order.orderId ? 'Đang gửi…' : 'Yêu cầu hủy'}
                      </button>
                    )}
                    <Link to={`/orders/${order.orderId}`} className="font-sans text-label-sm font-semibold text-primary hover:underline">Chi tiết</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <nav aria-label="Phân trang đơn hàng" className="mt-6 flex items-center justify-between rounded-xl bg-surface px-4 py-3 shadow-sm">
            <span className="font-sans text-body-sm text-on-surface-variant">Trang {result.page} / {totalPages} · {result.total} đơn</span>
            <div className="flex gap-2">
              <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm disabled:opacity-40">Trước</button>
              <button type="button" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm disabled:opacity-40">Sau</button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
};
