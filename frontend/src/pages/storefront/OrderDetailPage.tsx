import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { HttpError } from '../../services/http';
import { CustomerOrder, InvoiceSummary } from '../../types';

function formatPrice(value: string | bigint): string {
  const amount = typeof value === 'bigint' ? Number(value) / 100 : Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 2 }).format(amount);
}

function parseCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return 0n;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function checkoutUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const OrderDetailPage: React.FC = () => {
  const { orderId: rawOrderId } = useParams<{ orderId: string }>();
  const orderId = rawOrderId && /^\d+$/.test(rawOrderId) ? Number(rawOrderId) : NaN;
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const latestRequestSequence = useRef(0);
  const currentOrderId = useRef(orderId);
  currentOrderId.current = orderId;

  const loadOrder = useCallback(async () => {
    const requestSequence = ++latestRequestSequence.current;
    const requestedOrderId = orderId;
    const isCurrent = () => requestSequence === latestRequestSequence.current
      && currentOrderId.current === requestedOrderId;

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      if (!isCurrent()) return;
      setError('Mã đơn hàng không hợp lệ.');
      setOrder(null);
      setInvoice(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setInvoiceError(null);
    setCancelError(null);
    try {
      const result = await api.getCustomerOrder(orderId);
      if (!isCurrent()) return;
      setOrder(result);
      setInvoice(null);
      if (result.paymentStatus === 'paid') {
        try {
          const loadedInvoice = await api.getCustomerInvoice(orderId);
          if (isCurrent()) setInvoice(loadedInvoice);
        } catch (reason) {
          if (isCurrent() && !(reason instanceof HttpError && reason.status === 404)) {
            setInvoiceError(reason instanceof Error ? reason.message : 'Không thể tải biên nhận.');
          }
        }
      }
    } catch (reason) {
      if (!isCurrent()) return;
      setOrder(null);
      setInvoice(null);
      setError(reason instanceof Error ? reason.message : 'Không thể tải thông tin đơn hàng.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [orderId, retry]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  const cancelOrder = async () => {
    if (!order || order.status !== 'pending' || cancelling) return;
    if (!window.confirm(`Gửi yêu cầu hủy đơn #${order.orderId}? Máy chủ sẽ kiểm tra trạng thái thanh toán.`)) return;

    const requestedOrderId = order.orderId;
    const requestSequence = ++latestRequestSequence.current;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await api.cancelCustomerOrder(requestedOrderId);
      if (requestSequence !== latestRequestSequence.current || currentOrderId.current !== requestedOrderId) return;
      setOrder(updated);
      setInvoice(null);
    } catch (reason) {
      if (requestSequence !== latestRequestSequence.current || currentOrderId.current !== requestedOrderId) return;
      const message = reason instanceof HttpError && reason.status === 409
        ? `${reason.message} Đơn vẫn đang hiển thị theo trạng thái đã tải; hãy tải lại để kiểm tra.`
        : reason instanceof Error ? reason.message : 'Không thể hủy đơn. Vui lòng thử lại.';
      setCancelError(message);
    } finally {
      setCancelling(false);
      // Reconcile with the authenticated order endpoint after the cancellation attempt so
      // neither a stale page refresh nor an ambiguous response can hide the server state.
      setRetry((value) => value + 1);
    }
  };

  const itemsSubtotal = order?.details.reduce((sum, item) => sum + parseCents(item.subtotal), 0n) ?? 0n;
  const paymentLink = order?.checkoutUrl ? checkoutUrl(order.checkoutUrl) : null;
  const routeState = location.state as { checkoutLinkUnavailable?: boolean } | null;

  if (loading || (order !== null && order.orderId !== orderId)) {
    return <div role="status" className="mx-auto max-w-5xl px-gutter py-16"><div className="rounded-2xl bg-surface p-10 text-center font-body-md text-body-md text-on-surface-variant shadow-sm">Đang tải trạng thái đơn từ hệ thống…</div></div>;
  }

  if (!order || error) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center px-gutter py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-destructive">cloud_off</span>
        <h1 className="mt-4 font-headline-lg text-headline-lg font-bold text-on-surface">Chưa tải được đơn hàng</h1>
        <p role="alert" className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">{error}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg bg-primary px-5 py-3 font-label-md text-label-md font-semibold text-on-primary">Thử lại</button>
          <Link to="/orders" className="rounded-lg bg-surface px-5 py-3 font-label-md text-label-md font-semibold text-on-surface shadow-sm">Danh sách đơn</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-gutter py-8 sm:py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/orders" className="font-label-sm text-label-sm font-semibold text-primary hover:underline">← Đơn hàng của tôi</Link>
          <h1 className="mt-2 font-headline-lg text-headline-lg font-bold text-on-surface">Chi tiết đơn #{order.orderId}</h1>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Đặt lúc {formatDate(order.orderDate)}</p>
        </div>
        <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={cancelling} className="rounded-lg border border-outline-variant bg-surface px-4 py-2 font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50">{cancelling ? 'Đang cập nhật…' : 'Tải lại trạng thái'}</button>
      </div>

      {routeState?.checkoutLinkUnavailable && <p role="status" className="mb-5 rounded-xl border border-warning/30 bg-warning-soft p-4 font-body-sm text-body-sm text-on-surface">Đơn đã được máy chủ ghi nhận nhưng hiện chưa có liên kết thanh toán trong phản hồi. Trạng thái thanh toán đang được lấy từ hệ thống; hãy tải lại sau.</p>}
      {cancelError && <p role="alert" className="mb-5 rounded-xl bg-error-container p-4 font-body-sm text-body-sm text-on-error-container">{cancelError}</p>}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Sản phẩm</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === 'pending' ? 'bg-warning-soft text-warning' : order.status === 'packed' ? 'bg-info-soft text-info' : 'bg-destructive-soft text-destructive'}`}>{order.status === 'pending' ? 'Chờ xử lý' : order.status === 'packed' ? 'Đã đóng gói' : 'Đã hủy'}</span>
            </div>
            <div className="mt-4 divide-y divide-outline-variant">
              {order.details.map((line) => (
                <div key={`${line.orderId}-${line.variantId}`} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-label-md text-label-md font-semibold text-on-surface">{line.productName}</p>
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{[line.color, line.size ? `Size ${line.size}` : null].filter(Boolean).join(' · ') || 'Không có thuộc tính biến thể'} · Mã biến thể {line.variantId}</p>
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{line.quantity} × {formatPrice(line.unitPrice)}</p>
                  </div>
                  <span className="font-price-display font-bold text-on-surface">{formatPrice(line.subtotal)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Thông tin giao hàng</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><dt className="font-label-sm text-label-sm text-on-surface-variant">Người nhận</dt><dd className="mt-1 font-body-md text-body-md font-semibold text-on-surface">{order.recipientName}</dd></div>
              <div><dt className="font-label-sm text-label-sm text-on-surface-variant">Điện thoại</dt><dd className="mt-1 font-body-md text-body-md font-semibold text-on-surface">{order.recipientPhone}</dd></div>
              <div className="sm:col-span-2"><dt className="font-label-sm text-label-sm text-on-surface-variant">Địa chỉ</dt><dd className="mt-1 whitespace-pre-line font-body-md text-body-md text-on-surface">{order.shippingAddress}</dd></div>
              {order.note && <div className="sm:col-span-2"><dt className="font-label-sm text-label-sm text-on-surface-variant">Ghi chú</dt><dd className="mt-1 whitespace-pre-line font-body-md text-body-md text-on-surface">{order.note}</dd></div>}
            </dl>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Thanh toán</h2>
            <dl className="mt-4 space-y-3 font-body-sm text-body-sm">
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Tạm tính</dt><dd className="font-semibold text-on-surface">{formatPrice(itemsSubtotal)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Giảm giá{order.voucherCode ? ` · ${order.voucherCode}` : ''}</dt><dd className="font-semibold text-on-surface">−{formatPrice(order.discountAmount)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Phí giao hàng</dt><dd className="font-semibold text-on-surface">{formatPrice(order.shippingFee)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-outline-variant pt-3 font-label-md text-label-md"><dt className="font-semibold text-on-surface">Tổng thanh toán</dt><dd className="font-bold text-primary">{formatPrice(order.totalAmount)}</dd></div>
            </dl>
            <div className="mt-4 rounded-lg bg-surface-container-low p-3 font-body-sm text-body-sm">
              <p>Phương thức: <strong>{order.paymentMethod.toUpperCase()}</strong></p>
              <p className="mt-1">Trạng thái: <strong className={order.paymentStatus === 'paid' ? 'text-success' : 'text-warning'}>{order.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}</strong></p>
            </div>
            {paymentLink && order.paymentStatus === 'unpaid' && order.status === 'pending' && (
              <a href={paymentLink} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-label-md text-label-md font-semibold text-on-primary hover:bg-primary-hover"><span className="material-symbols-outlined">open_in_new</span>Tiếp tục thanh toán</a>
            )}
            {order.paymentMethod === 'payos' && order.paymentStatus === 'unpaid' && !paymentLink && (
              <p className="mt-4 rounded-lg bg-warning-soft p-3 font-body-sm text-body-sm text-on-surface">Chưa có liên kết thanh toán khả dụng trong trạng thái hiện tại. Hãy tải lại sau; không xác nhận thanh toán từ tham số URL.</p>
            )}
            {order.status === 'pending' && (
              <button type="button" onClick={() => void cancelOrder()} disabled={cancelling} className="mt-4 w-full rounded-lg border border-destructive/30 px-4 py-2.5 font-label-md text-label-md font-semibold text-destructive hover:bg-destructive-soft disabled:opacity-50">{cancelling ? 'Đang gửi yêu cầu…' : 'Yêu cầu hủy đơn'}</button>
            )}
          </section>

          {order.paymentStatus === 'paid' && (
            <section className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Biên nhận nội bộ</h2>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Biên nhận MVP, không phải hóa đơn thuế.</p>
              {invoice ? (
                <dl className="mt-4 space-y-2 font-body-sm text-body-sm">
                  <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Mã biên nhận</dt><dd className="font-semibold text-on-surface">{invoice.invoiceId}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Ngày phát hành</dt><dd className="text-right text-on-surface">{formatDate(invoice.issuedDate)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Số tiền</dt><dd className="font-semibold text-on-surface">{formatPrice(invoice.totalAmount)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Trạng thái</dt><dd className="text-on-surface">{invoice.status}</dd></div>
                </dl>
              ) : invoiceError ? (
                <div className="mt-4"><p role="alert" className="font-body-sm text-body-sm text-destructive">{invoiceError}</p><button type="button" disabled={cancelling} onClick={() => setRetry((value) => value + 1)} className="mt-2 font-label-sm text-label-sm font-semibold text-primary underline disabled:opacity-50">Tải biên nhận lại</button></div>
              ) : <p role="status" className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Chưa có biên nhận được trả về.</p>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
