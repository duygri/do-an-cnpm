import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { api, createIdempotencyKey } from '../../services/api';
import { HttpError } from '../../services/http';
import { CreateOrderRequest, CustomerOrder, CustomerProfile } from '../../types';

interface PendingPayosAttempt {
  key: string;
  payload: CreateOrderRequest;
}

interface PendingCodAttempt {
  startedAt: string;
}

interface CheckoutDraft {
  ownerId: number | null;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  note: string;
  voucherCode: string;
  paymentMethod: 'cod' | 'payos';
}

interface CustomerAttempts {
  ownerId: number;
  payos: PendingPayosAttempt | null;
  cod: PendingCodAttempt | null;
  payosCorrupt: boolean;
  codCorrupt: boolean;
  storageUnavailable: boolean;
}

function createCheckoutDraft(customer: CustomerProfile | null): CheckoutDraft {
  return {
    ownerId: customer?.customerId ?? null,
    recipientName: customer?.name ?? '',
    recipientPhone: customer?.phone ?? '',
    shippingAddress: customer?.address ?? '',
    note: '',
    voucherCode: '',
    paymentMethod: 'cod',
  };
}

function formatPrice(value: string | bigint): string {
  const amount = typeof value === 'bigint' ? Number(value) / 100 : Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return 0n;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
}

function isValidPayload(value: unknown, paymentMethod: 'cod' | 'payos'): value is CreateOrderRequest {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<CreateOrderRequest>;
  return payload.paymentMethod === paymentMethod
    && typeof payload.recipientName === 'string'
    && typeof payload.recipientPhone === 'string'
    && typeof payload.shippingAddress === 'string'
    && Array.isArray(payload.details)
    && payload.details.length > 0
    && payload.details.every((detail) => Number.isSafeInteger(detail.variantId)
      && detail.variantId > 0
      && Number.isSafeInteger(detail.quantity)
      && detail.quantity > 0);
}

function readPayosAttempt(storageKey: string): { attempt: PendingPayosAttempt | null; corrupt: boolean; unavailable: boolean } {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return { attempt: null, corrupt: false, unavailable: false };
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return { attempt: null, corrupt: true, unavailable: false };
    const attempt = parsed as Partial<PendingPayosAttempt>;
    if (typeof attempt.key !== 'string' || !attempt.key || !isValidPayload(attempt.payload, 'payos')) {
      return { attempt: null, corrupt: true, unavailable: false };
    }
    return { attempt: attempt as PendingPayosAttempt, corrupt: false, unavailable: false };
  } catch {
    return { attempt: null, corrupt: false, unavailable: true };
  }
}

function readCodAttempt(storageKey: string): { attempt: PendingCodAttempt | null; corrupt: boolean; unavailable: boolean } {
  try {
    const stored = window.localStorage.getItem(storageKey);
    const legacyKey = storageKey.replace('indigo_pending_cod_order_v2:', 'indigo_pending_cod_order:');
    const legacyStored = stored ? null : window.sessionStorage.getItem(legacyKey);
    const candidate = stored ?? legacyStored;
    if (!candidate) return { attempt: null, corrupt: false, unavailable: false };
    const parsed: unknown = JSON.parse(candidate);
    if (typeof parsed !== 'object' || parsed === null) return { attempt: null, corrupt: true, unavailable: false };
    const attempt = parsed as Partial<PendingCodAttempt>;
    if (typeof attempt.startedAt !== 'string' || Number.isNaN(Date.parse(attempt.startedAt))) {
      return { attempt: null, corrupt: true, unavailable: false };
    }
    if (!stored && legacyStored) {
      const migrated = JSON.stringify({ startedAt: attempt.startedAt });
      window.localStorage.setItem(storageKey, migrated);
      if (window.localStorage.getItem(storageKey) !== migrated) return { attempt: null, corrupt: false, unavailable: true };
      window.sessionStorage.removeItem(legacyKey);
    }
    return { attempt: attempt as PendingCodAttempt, corrupt: false, unavailable: false };
  } catch {
    return { attempt: null, corrupt: false, unavailable: true };
  }
}

function customerAttemptKey(customerId: number): string {
  return `indigo_pending_payos_order:${customerId}`;
}

function customerCodAttemptKey(customerId: number): string {
  return `indigo_pending_cod_order_v2:${customerId}`;
}

function customerCodLockName(customerId: number): string {
  return `indigo-cod-checkout:${customerId}`;
}

function codLockManager(): LockManager | null {
  if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') return null;
  return navigator.locks;
}

const COD_ATTEMPT_CHANGE_EVENT = 'indigo-cod-attempt-change';

function notifyCodAttemptChange(): void {
  window.dispatchEvent(new Event(COD_ATTEMPT_CHANGE_EVENT));
}

function checkoutUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export const CartPage: React.FC = () => {
  const { items, updateQuantity, removeFromCart, removeOrderedQuantities, refreshFromStorage, validateOrderQuantities, totalCount } = useCart();
  const { customer, customerLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const customerId = customer?.customerId ?? null;
  const currentCustomerId = useRef<number | null>(customerId);
  currentCustomerId.current = customerId;

  const [draft, setDraft] = useState<CheckoutDraft>(() => createCheckoutDraft(customer));
  const checkout = draft.ownerId === customerId ? draft : createCheckoutDraft(customer);
  const [attempts, setAttempts] = useState<CustomerAttempts | null>(null);
  const [submittingOwnerId, setSubmittingOwnerId] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<{ ownerId: number | null; message: string } | null>(null);
  const [attemptStorageError, setAttemptStorageError] = useState<{ ownerId: number; message: string } | null>(null);

  useEffect(() => {
    if (customerId === null || !customer) {
      setAttempts(null);
      setDraft(createCheckoutDraft(null));
      setAttemptStorageError(null);
      setCheckoutError(null);
      return;
    }

    const payos = readPayosAttempt(customerAttemptKey(customerId));
    const cod = readCodAttempt(customerCodAttemptKey(customerId));
    setAttempts({
      ownerId: customerId,
      payos: payos.attempt,
      cod: cod.attempt,
      payosCorrupt: payos.corrupt,
      codCorrupt: cod.corrupt,
      storageUnavailable: payos.unavailable || cod.unavailable,
    });
    setDraft(payos.attempt?.payload ? {
      ...createCheckoutDraft(customer),
      recipientName: payos.attempt.payload.recipientName,
      recipientPhone: payos.attempt.payload.recipientPhone,
      shippingAddress: payos.attempt.payload.shippingAddress,
      note: payos.attempt.payload.note ?? '',
      voucherCode: payos.attempt.payload.voucherCode ?? '',
      paymentMethod: payos.attempt.payload.paymentMethod,
    } : createCheckoutDraft(customer));
    setAttemptStorageError(payos.unavailable || cod.unavailable
      ? { ownerId: customerId, message: 'Trình duyệt không thể truy cập nơi lưu yêu cầu. Không thể gửi đơn an toàn.' }
      : null);
    setCheckoutError(null);
    // Checkout data and unresolved attempt state are deliberately reset only on account change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (customerId === null) return;
    const refreshCodAttempt = () => {
      const cod = readCodAttempt(customerCodAttemptKey(customerId));
      setAttempts((current) => current?.ownerId === customerId ? {
        ...current,
        cod: cod.attempt,
        codCorrupt: cod.corrupt,
        storageUnavailable: current.storageUnavailable || cod.unavailable,
      } : current);
      setAttemptStorageError((current) => {
        if (current?.ownerId !== customerId) return current;
        if (cod.unavailable) return { ownerId: customerId, message: 'Không thể đọc khóa chống gửi trùng COD từ bộ nhớ chung của trình duyệt.' };
        return current.message.includes('COD') ? null : current;
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === customerCodAttemptKey(customerId)) refreshCodAttempt();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(COD_ATTEMPT_CHANGE_EVENT, refreshCodAttempt);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(COD_ATTEMPT_CHANGE_EVENT, refreshCodAttempt);
    };
  }, [customerId]);

  const currentAttempts = attempts?.ownerId === customerId ? attempts : null;
  const pendingPayos = currentAttempts?.payos ?? null;
  const pendingCod = currentAttempts?.cod ?? null;
  const codNeedsResolution = Boolean(pendingCod || currentAttempts?.codCorrupt);
  const attemptCorrupt = Boolean(currentAttempts?.payosCorrupt || currentAttempts?.codCorrupt);
  const loadingAttempt = Boolean(customer && !currentAttempts);
  const attemptLocked = Boolean(pendingPayos || pendingCod || attemptCorrupt || loadingAttempt);
  const isSubmitting = submittingOwnerId === customerId;
  const requestedDetails = pendingPayos?.payload.details ?? null;
  const requestedQuantity = requestedDetails?.reduce((sum, detail) => sum + detail.quantity, 0) ?? totalCount;
  const visibleError = checkoutError?.ownerId === customerId ? checkoutError.message : null;
  const visibleStorageError = attemptStorageError?.ownerId === customerId ? attemptStorageError.message : null;
  const estimatedSubtotal = useMemo(() => items.reduce(
    (sum, item) => sum + parseCents(item.price) * BigInt(item.quantity),
    0n,
  ), [items]);

  const setError = (message: string | null, ownerId = customerId) => {
    setCheckoutError(message ? { ownerId, message } : null);
  };

  const updateDraft = (patch: Partial<Omit<CheckoutDraft, 'ownerId'>>) => {
    setDraft((current) => ({
      ...(current.ownerId === customerId ? current : createCheckoutDraft(customer)),
      ...patch,
      ownerId: customerId,
    }));
  };

  const clearAttempt = (ownerId: number, type: 'payos' | 'cod') => {
    let removed = true;
    try {
      const storage = type === 'payos' ? window.sessionStorage : window.localStorage;
      const key = type === 'payos' ? customerAttemptKey(ownerId) : customerCodAttemptKey(ownerId);
      storage.removeItem(key);
      if (storage.getItem(key) !== null) removed = false;
    } catch {
      removed = false;
      setAttemptStorageError({ ownerId, message: 'Không thể xóa dấu yêu cầu đã xử lý khỏi bộ nhớ trình duyệt.' });
    }
    if (removed) {
      setAttempts((current) => current?.ownerId === ownerId
        ? { ...current, [type]: null, [`${type}Corrupt`]: false }
        : current);
      setError(null, ownerId);
      if (type === 'cod') notifyCodAttemptChange();
    }
  };

  const resolveCodAttempt = async (ownerId: number) => {
    if (isSubmitting || currentCustomerId.current !== ownerId) return;
    const confirmed = window.confirm('Chỉ xác nhận sau khi đã kiểm tra đơn hàng và/hoặc liên hệ cửa hàng. Xóa khóa này không hủy đơn trên máy chủ; tiếp tục có thể tạo thêm đơn nếu đơn trước đã được ghi nhận. Bạn vẫn muốn mở khóa đặt COD?');
    if (!confirmed) return;

    const locks = codLockManager();
    if (!locks) {
      setError('Trình duyệt không hỗ trợ khóa giữa các tab. Chưa thể mở khóa COD an toàn; hãy mở trang bằng trình duyệt hiện đại sau khi đã kiểm tra đơn.', ownerId);
      return;
    }

    let acquired = false;
    try {
      await locks.request(customerCodLockName(ownerId), { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) return;
        acquired = true;
        const latest = readCodAttempt(customerCodAttemptKey(ownerId));
        if (latest.unavailable) {
          setAttemptStorageError({ ownerId, message: 'Không thể đọc khóa COD từ bộ nhớ chung của trình duyệt. Chưa mở khóa được.' });
          return;
        }
        if (!latest.attempt && !latest.corrupt) {
          setAttempts((current) => current?.ownerId === ownerId ? { ...current, cod: null, codCorrupt: false } : current);
          return;
        }
        clearAttempt(ownerId, 'cod');
      });
    } catch {
        setError('Trình duyệt không thể khóa thao tác COD giữa các tab. Chưa mở khóa được.', ownerId);
      return;
    }
    if (!acquired) {
      setError('Một tab khác đang gửi hoặc xác minh yêu cầu COD. Chờ tab đó xong rồi kiểm tra lại danh sách đơn trước khi mở khóa.', ownerId);
    }
  };

  const finishOrder = (order: CustomerOrder, method: 'cod' | 'payos', ownerId: number) => {
    if (order.customerId !== ownerId) {
      setError('Máy chủ trả về đơn không khớp tài khoản đang gửi. Yêu cầu được giữ để tránh gửi đơn trùng; hãy kiểm tra danh sách đơn.', ownerId);
      return;
    }
    const cartPersisted = removeOrderedQuantities(ownerId, order.details);
    // Persist the reduced cart before clearing the cross-tab COD marker. Other tabs listen
    // to the cart key and refresh before they can reserve another COD submission.
    if (method !== 'cod' || cartPersisted) clearAttempt(ownerId, method);

    // A late response for a signed-out/switched account must not navigate or redirect the new one.
    if (currentCustomerId.current !== ownerId || order.customerId !== ownerId) return;

    if (method === 'payos' && order.checkoutUrl) {
      const url = checkoutUrl(order.checkoutUrl);
      if (url) {
        window.location.assign(url);
        return;
      }
    }
    navigate(`/orders/${order.orderId}`, {
      replace: true,
      state: {
        paymentRedirectReturned: false,
        checkoutLinkUnavailable: method === 'payos'
          && order.paymentStatus === 'unpaid'
          && !order.checkoutUrl,
      },
    });
  };

  const retryPayos = async (ownerId: number, attempt: PendingPayosAttempt) => {
    setSubmittingOwnerId(ownerId);
    setError(null, ownerId);
    try {
      const order = await api.createOrder(attempt.payload, { expectedCustomerId: ownerId, idempotencyKey: attempt.key });
      finishOrder(order, 'payos', ownerId);
    } catch (requestError) {
      if (requestError instanceof HttpError && requestError.status === 400) {
        clearAttempt(ownerId, 'payos');
        setError(requestError.message, ownerId);
      } else {
        setError(requestError instanceof Error
          ? `${requestError.message} Yêu cầu PayOS vẫn được giữ nguyên; lần thử lại sẽ dùng cùng key và payload.`
          : 'Chưa xác định được kết quả. Yêu cầu PayOS vẫn được giữ nguyên.', ownerId);
      }
    } finally {
      setSubmittingOwnerId((current) => current === ownerId ? null : current);
    }
  };

  const handlePlaceOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!customer) {
      navigate('/login', { state: { from: location } });
      return;
    }
    const ownerId = customer.customerId;
    if (customerLoading || loadingAttempt) return;
    if (attemptCorrupt || currentAttempts?.storageUnavailable) {
      setError('Không đọc được dấu yêu cầu trước đó. Hãy kiểm tra danh sách đơn trước; không gửi một yêu cầu mới khi kết quả cũ chưa rõ.', ownerId);
      return;
    }
    if (pendingPayos) {
      await retryPayos(ownerId, pendingPayos);
      return;
    }
    if (pendingCod) {
      setError('Yêu cầu COD trước có thể đã được ghi nhận. Không gửi lại; hãy kiểm tra danh sách đơn hoặc liên hệ cửa hàng để xác minh.', ownerId);
      return;
    }
    if (items.length === 0) {
      setError('Giỏ hàng đang trống.', ownerId);
      return;
    }

    const payload: CreateOrderRequest = {
      recipientName: checkout.recipientName.trim(),
      recipientPhone: checkout.recipientPhone.trim(),
      shippingAddress: checkout.shippingAddress.trim(),
      details: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
      ...(checkout.note.trim() ? { note: checkout.note.trim() } : {}),
      ...(checkout.voucherCode.trim() ? { voucherCode: checkout.voucherCode.trim() } : {}),
      paymentMethod: checkout.paymentMethod,
    };

    if (checkout.paymentMethod === 'payos') {
      let attempt: PendingPayosAttempt;
      try {
        attempt = { key: createIdempotencyKey(), payload };
        window.sessionStorage.setItem(customerAttemptKey(ownerId), JSON.stringify(attempt));
      } catch {
        setAttemptStorageError({ ownerId, message: 'Không thể lưu yêu cầu PayOS vào phiên trình duyệt. Chưa gửi yêu cầu; hãy bật sessionStorage rồi thử lại.' });
        return;
      }
      setAttempts((current) => current?.ownerId === ownerId
        ? { ...current, payos: attempt, payosCorrupt: false }
        : current);
      setSubmittingOwnerId(ownerId);
      try {
        const order = await api.createOrder(payload, { expectedCustomerId: ownerId, idempotencyKey: attempt.key });
        finishOrder(order, 'payos', ownerId);
      } catch (requestError) {
        if (requestError instanceof HttpError && requestError.status === 400) {
          clearAttempt(ownerId, 'payos');
          setError(requestError.message, ownerId);
        } else {
          setError(requestError instanceof Error
            ? `${requestError.message} Yêu cầu PayOS vẫn được giữ; có thể thử lại bằng đúng key và payload đã lưu.`
            : 'Chưa xác định được kết quả. Yêu cầu PayOS vẫn được giữ để thử lại bằng cùng key và payload.', ownerId);
        }
      } finally {
        setSubmittingOwnerId((current) => current === ownerId ? null : current);
      }
      return;
    }

    const locks = codLockManager();
    if (!locks) {
      setError('Trình duyệt này không hỗ trợ khóa giữa các tab (Web Locks). Chưa gửi COD; hãy dùng trình duyệt hiện đại để tránh tạo đơn trùng.', ownerId);
      return;
    }

    let reservation: 'busy' | 'existing' | 'corrupt' | 'unavailable' | 'cart-unavailable' | 'cart-changed' | 'not-persisted' | 'submitted' | null = null;
    try {
      await locks.request(customerCodLockName(ownerId), { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) {
          reservation = 'busy';
          return;
        }

        // Check and write while holding the per-customer Web Lock. Keep the lock until the
        // request resolves so another tab cannot manually clear an in-flight marker.
        const key = customerCodAttemptKey(ownerId);
        const latest = readCodAttempt(key);
        if (latest.unavailable) {
          reservation = 'unavailable';
          return;
        }
        if (latest.corrupt) {
          reservation = 'corrupt';
          setAttempts((current) => current?.ownerId === ownerId ? { ...current, cod: null, codCorrupt: true } : current);
          return;
        }
        if (latest.attempt) {
          reservation = 'existing';
          setAttempts((current) => current?.ownerId === ownerId
            ? { ...current, cod: latest.attempt, codCorrupt: false }
            : current);
          return;
        }

        const cartValidation = validateOrderQuantities(ownerId, payload.details);
        if (cartValidation === 'unavailable') {
          reservation = 'cart-unavailable';
          return;
        }
        if (cartValidation === 'changed') {
          reservation = 'cart-changed';
          refreshFromStorage();
          return;
        }

        const codAttempt: PendingCodAttempt = { startedAt: new Date().toISOString() };
        const serialized = JSON.stringify(codAttempt);
        try {
          window.localStorage.setItem(key, serialized);
          if (window.localStorage.getItem(key) !== serialized) throw new Error('COD lock was not persisted');
        } catch {
          reservation = 'not-persisted';
          return;
        }
        notifyCodAttemptChange();
        setAttempts((current) => current?.ownerId === ownerId
          ? { ...current, cod: codAttempt, codCorrupt: false }
          : current);
        setSubmittingOwnerId(ownerId);
        try {
          const order = await api.createOrder(payload, { expectedCustomerId: ownerId });
          finishOrder(order, 'cod', ownerId);
        } catch (requestError) {
          if (requestError instanceof HttpError && requestError.status < 500) {
            clearAttempt(ownerId, 'cod');
            setError(requestError.message, ownerId);
          } else {
            setError('Chưa xác định được máy chủ đã ghi nhận đơn COD chưa. Yêu cầu đã khóa để tránh tạo đơn trùng; hãy kiểm tra danh sách đơn hoặc liên hệ cửa hàng.', ownerId);
          }
        } finally {
          setSubmittingOwnerId((current) => current === ownerId ? null : current);
        }
        reservation = 'submitted';
      });
    } catch {
      setError('Trình duyệt không thể khóa thao tác COD giữa các tab. Chưa gửi đơn; hãy dùng trình duyệt hiện đại để tránh tạo đơn trùng.', ownerId);
      return;
    }

    if (reservation === 'busy') {
      setError('Một tab khác đang gửi hoặc xử lý đơn COD. Chưa gửi đơn từ tab này; hãy chờ và kiểm tra danh sách đơn.', ownerId);
    } else if (reservation === 'existing') {
      setError('Yêu cầu COD trước có thể đã được ghi nhận. Không gửi lại; hãy kiểm tra danh sách đơn hoặc liên hệ cửa hàng để xác minh.', ownerId);
    } else if (reservation === 'corrupt') {
      setError('Không đọc được khóa COD trước đó. Hãy kiểm tra danh sách đơn trước khi chủ động mở khóa.', ownerId);
    } else if (reservation === 'unavailable' || reservation === 'not-persisted') {
      setAttemptStorageError({ ownerId, message: 'Không thể đọc hoặc lưu khóa chống gửi trùng COD vào bộ nhớ chung. Chưa gửi đơn; bật localStorage rồi thử lại.' });
    } else if (reservation === 'cart-unavailable') {
      setAttemptStorageError({ ownerId, message: 'Không thể xác minh giỏ hàng đã lưu giữa các tab. Chưa gửi COD; bật localStorage rồi thử lại.' });
    } else if (reservation === 'cart-changed') {
      setError('Giỏ hàng vừa thay đổi ở một tab khác. Đã đồng bộ số lượng mới; hãy kiểm tra lại trước khi đặt đơn.', ownerId);
    }
  };

  if (items.length === 0 && !pendingPayos && !pendingCod && !attemptCorrupt && !loadingAttempt) {
    return (
      <div className="max-w-7xl mx-auto px-gutter py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-surface-container-low text-primary mx-auto flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-4xl">shopping_cart</span>
        </div>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface mb-2">Giỏ hàng của bạn đang trống</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">Hãy chọn sản phẩm và biến thể từ danh mục để bắt đầu đặt hàng.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-white font-semibold shadow hover:bg-primary-hover transition-colors">
          <span className="material-symbols-outlined text-xl">storefront</span>Khám phá sản phẩm
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-gutter py-space-lg">
      <div className="mb-space-xl flex flex-col gap-space-md md:flex-row md:items-end md:justify-between">
        <div className="space-y-space-xs">
          <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant"><Link to="/" className="hover:text-primary">INDIGO STORE</Link><span className="material-symbols-outlined text-sm">chevron_right</span><span>GIỎ HÀNG</span></div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Giỏ hàng &amp; thanh toán</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Giá trị hiển thị trong giỏ chỉ là tạm tính; đơn hàng và mọi khoản giảm trừ được máy chủ xác nhận.</p>
        </div>
        <Link to="/orders" className="font-label-md text-label-md font-semibold text-primary hover:underline">Xem đơn hàng của tôi</Link>
      </div>

      {(pendingPayos || pendingCod || attemptCorrupt) && (
        <div role="status" className="mb-space-lg rounded-xl border border-warning/30 bg-warning-soft p-4 font-body-sm text-body-sm text-on-surface">
          <p className="font-label-md font-semibold">{codNeedsResolution ? 'Yêu cầu COD chưa xác định kết quả.' : 'Đang có yêu cầu PayOS chưa xác định kết quả.'}</p>
          <p className="mt-1">{codNeedsResolution
            ? 'Không gửi lại yêu cầu COD này vì backend không cung cấp idempotency cho COD. Hãy kiểm tra danh sách đơn hoặc liên hệ cửa hàng để xác minh.'
            : 'Thông tin giao hàng, voucher, phương thức thanh toán và nội dung gửi trước được giữ nguyên khi thử lại. Giỏ hiện tại không làm thay đổi payload đang chờ.'}</p>
          {pendingCod && <p className="mt-2">Khóa này được ghi lúc {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(pendingCod.startedAt))}.</p>}
          {requestedDetails && <ul className="mt-2 list-inside list-disc">{requestedDetails.map((detail) => <li key={detail.variantId}>Biến thể {detail.variantId} × {detail.quantity}</li>)}</ul>}
          {attemptCorrupt && <p className="mt-2" role="alert">Không thể khôi phục dấu yêu cầu đã lưu. Đừng tạo yêu cầu mới trước khi kiểm tra danh sách đơn.</p>}
          {codNeedsResolution && <Link to="/orders" className="mt-2 inline-block font-label-sm font-semibold text-primary underline">Kiểm tra danh sách đơn</Link>}
          {codNeedsResolution && customer && <button type="button" disabled={isSubmitting} onClick={() => void resolveCodAttempt(customer.customerId)} className="ml-3 mt-2 inline-block font-label-sm font-semibold text-primary underline disabled:opacity-50">Tôi đã kiểm tra đơn hàng hoặc liên hệ cửa hàng — mở khóa COD</button>}
        </div>
      )}

      {!customer && <div className="mb-space-lg rounded-xl border border-primary/20 bg-primary-soft/50 p-4 font-body-sm text-body-sm text-on-surface">Bạn có thể tiếp tục xem giỏ hàng. Hãy <Link to="/login" state={{ from: location }} className="font-semibold text-primary underline">đăng nhập khách hàng</Link> trước khi đặt đơn.</div>}
      {visibleError && <p role="alert" className="mb-space-lg rounded-xl bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container">{visibleError}</p>}
      {visibleStorageError && <p role="alert" className="mb-space-lg rounded-xl bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container">{visibleStorageError}</p>}
      {loadingAttempt && <p role="status" className="mb-space-lg rounded-xl bg-surface p-4 font-body-sm text-body-sm text-on-surface-variant">Đang khôi phục trạng thái yêu cầu của tài khoản…</p>}

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <section className="space-y-space-md lg:col-span-7">
          <div className="rounded-xl bg-surface p-space-lg shadow-sm">
            <div className="mb-space-md flex items-center justify-between border-b border-outline-variant pb-space-md">
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{requestedDetails ? `Yêu cầu đang lưu (${requestedQuantity})` : `Sản phẩm (${totalCount})`}</h2>
              <Link to="/" className="font-label-md text-label-md font-semibold text-primary hover:underline">Tiếp tục mua sắm</Link>
            </div>
            <div className="space-y-space-md">
              {requestedDetails ? requestedDetails.map((detail) => <div key={detail.variantId} className="rounded-xl bg-canvas p-space-md font-body-md text-body-md text-on-surface">Biến thể {detail.variantId} × {detail.quantity}</div>) : items.map((item) => (
                <article key={item.variantId} className="flex flex-col items-start justify-between gap-space-md rounded-xl bg-canvas p-space-md sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-space-md">
                    <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-container">{item.imageUrl ? <img className="h-full w-full object-cover" src={item.imageUrl} alt={item.name} /> : <div className="flex h-full items-center justify-center text-outline"><span className="material-symbols-outlined">image</span></div>}</div>
                    <div className="min-w-0"><h3 className="truncate font-label-lg text-label-lg font-bold text-on-surface">{item.name}</h3><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{[item.color, item.size ? `Size ${item.size}` : null].filter(Boolean).join(' · ') || 'Không có thuộc tính biến thể'}</p><p className="mt-2 font-price-display text-base font-bold text-primary">{formatPrice(item.price)}</p></div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-space-sm sm:w-auto sm:justify-end">
                    <div className="flex items-center rounded-lg bg-surface p-1 shadow-xs"><button type="button" aria-label={`Giảm số lượng ${item.name}`} disabled={attemptLocked || isSubmitting} onClick={() => updateQuantity(item.variantId, -1)} className="flex h-8 w-8 items-center justify-center rounded text-on-surface hover:bg-surface-container-low disabled:opacity-50"><span className="material-symbols-outlined text-base">remove</span></button><span className="w-9 text-center font-label-md text-label-md font-bold">{item.quantity}</span><button type="button" aria-label={`Tăng số lượng ${item.name}`} disabled={attemptLocked || isSubmitting} onClick={() => updateQuantity(item.variantId, 1)} className="flex h-8 w-8 items-center justify-center rounded text-on-surface hover:bg-surface-container-low disabled:opacity-50"><span className="material-symbols-outlined text-base">add</span></button></div>
                    <span className="min-w-24 text-right font-price-display text-base font-bold text-on-surface">{formatPrice(parseCents(item.price) * BigInt(item.quantity))}</span>
                    <button type="button" aria-label={`Xóa ${item.name}`} disabled={attemptLocked || isSubmitting} onClick={() => removeFromCart(item.variantId)} className="rounded-lg p-2 text-outline hover:bg-destructive-soft hover:text-destructive disabled:opacity-50"><span className="material-symbols-outlined">delete_outline</span></button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-space-md rounded-xl bg-surface p-space-lg shadow-sm">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Thông tin giao hàng</h2>
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
              <label className="block"><span className="font-label-md text-label-md font-semibold text-on-surface">Tên người nhận *</span><input required maxLength={120} autoComplete="name" value={checkout.recipientName} onChange={(event) => updateDraft({ recipientName: event.target.value })} disabled={attemptLocked || isSubmitting} className="mt-1.5 h-11 w-full rounded-lg bg-surface-container-low px-3 font-body-md text-body-md text-on-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-70" /></label>
              <label className="block"><span className="font-label-md text-label-md font-semibold text-on-surface">Số điện thoại *</span><input required maxLength={30} type="tel" autoComplete="tel" value={checkout.recipientPhone} onChange={(event) => updateDraft({ recipientPhone: event.target.value })} disabled={attemptLocked || isSubmitting} className="mt-1.5 h-11 w-full rounded-lg bg-surface-container-low px-3 font-body-md text-body-md text-on-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-70" /></label>
            </div>
            <label className="block"><span className="font-label-md text-label-md font-semibold text-on-surface">Địa chỉ giao hàng *</span><textarea required autoComplete="street-address" rows={3} value={checkout.shippingAddress} onChange={(event) => updateDraft({ shippingAddress: event.target.value })} disabled={attemptLocked || isSubmitting} className="mt-1.5 w-full rounded-lg bg-surface-container-low px-3 py-2.5 font-body-md text-body-md text-on-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-70" /></label>
            <label className="block"><span className="font-label-md text-label-md font-semibold text-on-surface">Mã voucher (không bắt buộc)</span><input maxLength={64} value={checkout.voucherCode} onChange={(event) => updateDraft({ voucherCode: event.target.value })} disabled={attemptLocked || isSubmitting} className="mt-1.5 h-11 w-full rounded-lg bg-surface-container-low px-3 font-body-md text-body-md uppercase text-on-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-70" /></label>
            <label className="block"><span className="font-label-md text-label-md font-semibold text-on-surface">Ghi chú (không bắt buộc)</span><textarea rows={2} value={checkout.note} onChange={(event) => updateDraft({ note: event.target.value })} disabled={attemptLocked || isSubmitting} className="mt-1.5 w-full rounded-lg bg-surface-container-low px-3 py-2.5 font-body-md text-body-md text-on-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-70" /></label>
            <fieldset disabled={attemptLocked || isSubmitting} className="space-y-2">
              <legend className="font-label-md text-label-md font-semibold text-on-surface">Phương thức thanh toán</legend>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant p-3"><input type="radio" name="paymentMethod" value="cod" checked={checkout.paymentMethod === 'cod'} onChange={() => updateDraft({ paymentMethod: 'cod' })} /><span><span className="block font-label-md font-semibold">Thanh toán khi nhận hàng (COD)</span><span className="block font-body-sm text-body-sm text-on-surface-variant">Thanh toán cho nhân viên giao hàng.</span></span></label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant p-3"><input type="radio" name="paymentMethod" value="payos" checked={checkout.paymentMethod === 'payos'} onChange={() => updateDraft({ paymentMethod: 'payos' })} /><span><span className="block font-label-md font-semibold">Thanh toán trực tuyến qua PayOS</span><span className="block font-body-sm text-body-sm text-on-surface-variant">Bạn sẽ được chuyển đến trang thanh toán nếu máy chủ trả về liên kết.</span></span></label>
            </fieldset>
          </form>
        </section>

        <aside className="space-y-space-md lg:col-span-5"><section className="sticky top-40 rounded-xl bg-surface p-space-lg shadow-sm">
          <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Tóm tắt</h2>
          {requestedDetails ? <p className="mt-space-md border-b border-outline-variant pb-space-md font-body-sm text-body-sm text-on-surface-variant">Lần thử lại PayOS sẽ dùng đúng payload đã lưu. Tổng và voucher do máy chủ trả về.</p> : pendingCod ? <p className="mt-space-md border-b border-outline-variant pb-space-md font-body-sm text-body-sm text-on-surface-variant">Yêu cầu COD đang bị khóa để tránh tạo đơn trùng. Kiểm tra trạng thái đơn trước khi mở khóa.</p> : <div className="mt-space-md flex items-center justify-between border-b border-outline-variant pb-space-md font-body-md text-body-md text-on-surface-variant"><span>Tạm tính ({totalCount} sản phẩm)</span><span className="font-semibold text-on-surface">{formatPrice(estimatedSubtotal)}</span></div>}
          {!requestedDetails && <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">Voucher, phí giao hàng và tổng thanh toán sẽ do máy chủ tính và trả về sau khi đặt đơn.</p>}
          {checkout.paymentMethod === 'cod' && !codLockManager() && <p className="mt-space-md rounded-lg bg-warning-soft p-3 font-body-sm text-body-sm text-on-surface">Để tránh gửi trùng giữa các tab, COD cần trình duyệt hỗ trợ Web Locks. Trình duyệt này chưa hỗ trợ nên chưa thể đặt COD.</p>}
          {customer ? <button type="submit" form="checkout-form" disabled={isSubmitting || customerLoading || loadingAttempt || (items.length === 0 && !pendingPayos) || attemptCorrupt || Boolean(checkout.paymentMethod === 'payos' && visibleStorageError && !pendingPayos) || Boolean(checkout.paymentMethod === 'cod' && (!codLockManager() || visibleStorageError || currentAttempts?.storageUnavailable)) || Boolean(pendingCod)} className="mt-space-lg flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 font-label-lg text-label-lg font-semibold text-on-primary shadow-md transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><span className="material-symbols-outlined">{isSubmitting ? 'hourglass_top' : pendingPayos ? 'refresh' : 'lock'}</span>{isSubmitting ? 'Đang gửi yêu cầu…' : pendingPayos ? 'Thử lại đúng yêu cầu PayOS' : pendingCod ? 'Đang chờ xác minh COD' : 'Đặt hàng'}</button> : <Link to="/login" state={{ from: location }} className="mt-space-lg flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3.5 font-label-lg text-label-lg font-semibold text-on-primary shadow-md hover:bg-primary-hover">Đăng nhập để đặt hàng</Link>}
          {pendingCod && <Link to="/orders" className="mt-3 block text-center font-label-sm text-label-sm font-semibold text-primary underline">Mở danh sách đơn hàng để kiểm tra</Link>}
        </section></aside>
      </div>
    </div>
  );
};
