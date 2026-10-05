import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Promotion, Voucher } from '../../types';

type PromotionDraft = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
};

type VoucherDraft = {
  code: string;
  name: string;
  type: 'fixed' | 'percentage';
  discountValue: string;
  startDate: string;
  endDate: string;
  minPrice: string;
  maxDiscount: string;
  quantity: string;
};

const emptyPromotion: PromotionDraft = {
  name: '', description: '', startDate: '', endDate: '',
};

const emptyVoucher: VoucherDraft = {
  code: '', name: '', type: 'fixed', discountValue: '', startDate: '', endDate: '',
  minPrice: '0', maxDiscount: '', quantity: '1',
};

const fieldClass = 'mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'block font-label-sm text-label-sm font-semibold text-on-surface';
const primaryButtonClass = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-label-sm text-label-sm font-bold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2.5 font-label-sm text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatMoney(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('vi-VN', {
        style: 'currency', currency: 'VND', maximumFractionDigits: 2,
      }).format(amount)
    : value;
}

function promotionDraftFrom(promotion: Promotion): PromotionDraft {
  return {
    name: promotion.name,
    description: promotion.description ?? '',
    startDate: promotion.startDate.slice(0, 10),
    endDate: promotion.endDate.slice(0, 10),
  };
}

function voucherDraftFrom(voucher: Voucher): VoucherDraft {
  return {
    code: voucher.code,
    name: voucher.name,
    type: voucher.type,
    discountValue: voucher.discountValue,
    startDate: voucher.startDate.slice(0, 10),
    endDate: voucher.endDate.slice(0, 10),
    minPrice: voucher.minPrice,
    maxDiscount: voucher.maxDiscount ?? '',
    quantity: String(voucher.quantity),
  };
}

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'active' ? 'bg-success-soft text-success' : 'bg-surface-container-high text-on-surface-variant'}`}>
      {status === 'active' ? 'Đang hoạt động' : 'Ngừng áp dụng'}
    </span>
  );
}

export const AdminPromotionsPage: React.FC = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState(true);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);
  const [promotionRetry, setPromotionRetry] = useState(0);
  const [selectedPromotionId, setSelectedPromotionId] = useState<number | null>(null);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherListPromotionId, setVoucherListPromotionId] = useState<number | null>(null);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [vouchersError, setVouchersError] = useState<string | null>(null);
  const [voucherRetry, setVoucherRetry] = useState(0);

  const [promotionFormOpen, setPromotionFormOpen] = useState(false);
  const [editingPromotionId, setEditingPromotionId] = useState<number | null>(null);
  const [promotionDraft, setPromotionDraft] = useState<PromotionDraft>(emptyPromotion);
  const [voucherFormOpen, setVoucherFormOpen] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);
  const [voucherDraft, setVoucherDraft] = useState<VoucherDraft>(emptyVoucher);

  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const promotionRequest = useRef(0);
  const voucherRequest = useRef(0);

  const loadPromotions = useCallback(async () => {
    const requestId = ++promotionRequest.current;
    setPromotionsLoading(true);
    setPromotionsError(null);
    try {
      const result = await api.getPromotions();
      if (requestId === promotionRequest.current) {
        setPromotions(result);
        setSelectedPromotionId((current) => (
          current !== null && result.some((promotion) => promotion.promotionId === current)
            ? current
            : result[0]?.promotionId ?? null
        ));
      }
    } catch (error: unknown) {
      if (requestId === promotionRequest.current) {
        setPromotionsError(errorMessage(error, 'Không thể tải chương trình khuyến mãi.'));
      }
    } finally {
      if (requestId === promotionRequest.current) setPromotionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPromotions();
  }, [loadPromotions, promotionRetry]);

  const selectedPromotion = promotions.find(
    (promotion) => promotion.promotionId === selectedPromotionId,
  ) ?? null;
  const vouchersMatchSelection = selectedPromotionId !== null
    && voucherListPromotionId === selectedPromotionId;

  const loadVouchers = useCallback(async (promotionId: number) => {
    const requestId = ++voucherRequest.current;
    setVoucherListPromotionId(promotionId);
    setVouchers([]);
    setVouchersLoading(true);
    setVouchersError(null);
    try {
      const result = await api.getVouchers(promotionId);
      if (requestId === voucherRequest.current) setVouchers(result);
    } catch (error: unknown) {
      if (requestId === voucherRequest.current) {
        setVouchersError(errorMessage(error, 'Không thể tải voucher của chương trình.'));
      }
    } finally {
      if (requestId === voucherRequest.current) setVouchersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPromotionId === null) {
      voucherRequest.current += 1;
      setVoucherListPromotionId(null);
      setVouchers([]);
      setVouchersError(null);
      setVouchersLoading(false);
      setVoucherFormOpen(false);
      return;
    }
    void loadVouchers(selectedPromotionId);
  }, [loadVouchers, selectedPromotionId, voucherRetry]);

  const clearFeedback = () => {
    setActionError(null);
    setNotice(null);
  };

  const startCreatePromotion = () => {
    clearFeedback();
    setEditingPromotionId(null);
    setPromotionDraft(emptyPromotion);
    setPromotionFormOpen(true);
  };

  const startEditPromotion = (promotion: Promotion) => {
    clearFeedback();
    setEditingPromotionId(promotion.promotionId);
    setPromotionDraft(promotionDraftFrom(promotion));
    setPromotionFormOpen(true);
  };

  const savePromotion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    const isEditing = editingPromotionId !== null;
    setActionId(isEditing ? `promotion-update-${editingPromotionId}` : 'promotion-create');
    try {
      const data = {
        name: promotionDraft.name,
        description: promotionDraft.description.trim() || null,
        startDate: promotionDraft.startDate,
        endDate: promotionDraft.endDate,
      };
      const saved = isEditing
        ? await api.updatePromotion(editingPromotionId, data)
        : await api.createPromotion(data);
      setSelectedPromotionId(saved.promotionId);
      setPromotionFormOpen(false);
      setPromotionDraft(emptyPromotion);
      setNotice(isEditing ? 'Đã cập nhật chương trình.' : 'Đã tạo chương trình.');
      setPromotionRetry((value) => value + 1);
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể lưu chương trình. Hãy kiểm tra ngày và dữ liệu nhập.'));
    } finally {
      setActionId(null);
    }
  };

  const changePromotionStatus = async (promotion: Promotion) => {
    clearFeedback();
    const nextStatus = promotion.status === 'active' ? 'inactive' : 'active';
    setActionId(`promotion-status-${promotion.promotionId}`);
    try {
      const saved = await api.updatePromotion(promotion.promotionId, { status: nextStatus });
      // Ignore list requests that started before this successful mutation so a stale
      // refresh cannot replace the status returned by the server.
      promotionRequest.current += 1;
      setPromotionsLoading(true);
      setPromotions((current) => current.map((item) => (
        item.promotionId === saved.promotionId ? saved : item
      )));
      setNotice(nextStatus === 'inactive' ? 'Đã ngừng áp dụng chương trình.' : 'Đã kích hoạt lại chương trình.');
      setPromotionRetry((value) => value + 1);
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể đổi trạng thái chương trình.'));
    } finally {
      setActionId(null);
    }
  };

  const startCreateVoucher = () => {
    clearFeedback();
    setEditingVoucherId(null);
    setVoucherDraft(emptyVoucher);
    setVoucherFormOpen(true);
  };

  const startEditVoucher = (voucher: Voucher) => {
    clearFeedback();
    setEditingVoucherId(voucher.voucherId);
    setVoucherDraft(voucherDraftFrom(voucher));
    setVoucherFormOpen(true);
  };

  const saveVoucher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedPromotionId === null) return;
    clearFeedback();
    const isEditing = editingVoucherId !== null;
    setActionId(isEditing ? `voucher-update-${editingVoucherId}` : 'voucher-create');
    const commonData = {
      name: voucherDraft.name,
      type: voucherDraft.type,
      discountValue: voucherDraft.discountValue,
      startDate: voucherDraft.startDate,
      endDate: voucherDraft.endDate,
      minPrice: voucherDraft.minPrice,
      maxDiscount: voucherDraft.maxDiscount.trim() || null,
      quantity: Number(voucherDraft.quantity),
    };
    try {
      if (isEditing) {
        await api.updateVoucher(selectedPromotionId, editingVoucherId, commonData);
      } else {
        await api.createVoucher(selectedPromotionId, {
          ...commonData,
          code: voucherDraft.code,
        });
      }
      setVoucherFormOpen(false);
      setEditingVoucherId(null);
      setVoucherDraft(emptyVoucher);
      setNotice(isEditing ? 'Đã cập nhật voucher.' : 'Đã tạo voucher. Mã được máy chủ chuẩn hóa và lưu.' );
      setVoucherRetry((value) => value + 1);
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể lưu voucher. Hãy kiểm tra ngày, mức giảm, số lượt và mã voucher.'));
    } finally {
      setActionId(null);
    }
  };

  const changeVoucherStatus = async (voucher: Voucher) => {
    if (selectedPromotionId === null) return;
    clearFeedback();
    const nextStatus = voucher.status === 'active' ? 'inactive' : 'active';
    setActionId(`voucher-status-${voucher.voucherId}`);
    try {
      await api.updateVoucher(selectedPromotionId, voucher.voucherId, { status: nextStatus });
      setVouchers((current) => current.map((item) => (
        item.voucherId === voucher.voucherId ? { ...item, status: nextStatus } : item
      )));
      setNotice(nextStatus === 'inactive' ? 'Đã ngừng áp dụng voucher.' : 'Đã kích hoạt lại voucher.');
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể đổi trạng thái voucher.'));
    } finally {
      setActionId(null);
    }
  };

  const busy = actionId !== null || promotionsLoading;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-label-xs text-label-xs font-bold uppercase tracking-[0.16em] text-primary">Quản lý ưu đãi</p>
          <h1 className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">Khuyến mãi và voucher</h1>
          <p className="mt-2 max-w-3xl font-body-sm text-body-sm text-on-surface-variant">Quản lý chương trình và mã giảm giá theo quy tắc từ máy chủ. Kết quả áp dụng voucher chỉ được xác định khi khách đặt hàng.</p>
        </div>
        <button type="button" onClick={startCreatePromotion} disabled={busy} className={primaryButtonClass}>
          <span aria-hidden="true" className="material-symbols-outlined mr-2 text-[20px]">add</span>
          Tạo chương trình
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl border border-success/20 bg-success-soft px-4 py-3 font-body-sm text-body-sm text-success">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive-soft px-4 py-3 font-body-sm text-body-sm text-destructive">{actionError}</p>}

      {promotionFormOpen && (
        <form onSubmit={savePromotion} className="rounded-2xl border border-primary/20 bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{editingPromotionId === null ? 'Tạo chương trình' : `Sửa chương trình #${editingPromotionId}`}</h2>
              <p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">Ngày nhập theo định dạng năm-tháng-ngày. Máy chủ kiểm tra khoảng ngày và dữ liệu.</p>
            </div>
            <button type="button" onClick={() => setPromotionFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Đóng biểu mẫu</button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>Tên chương trình
              <input required maxLength={120} value={promotionDraft.name} disabled={busy} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, name: event.target.value }))} className={fieldClass} />
            </label>
            <label className={labelClass}>Mô tả <span className="font-normal text-on-surface-variant">(không bắt buộc)</span>
              <input maxLength={5000} value={promotionDraft.description} disabled={busy} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, description: event.target.value }))} className={fieldClass} />
            </label>
            <label className={labelClass}>Ngày bắt đầu
              <input required type="date" value={promotionDraft.startDate} disabled={busy} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, startDate: event.target.value }))} className={fieldClass} />
            </label>
            <label className={labelClass}>Ngày kết thúc
              <input required type="date" value={promotionDraft.endDate} disabled={busy} onChange={(event) => setPromotionDraft((draft) => ({ ...draft, endDate: event.target.value }))} className={fieldClass} />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Đang lưu…' : 'Lưu chương trình'}</button>
            <button type="button" onClick={() => setPromotionFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Hủy</button>
          </div>
        </form>
      )}

      {promotionsError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-surface p-4 text-destructive">
          <p className="font-body-sm text-body-sm">{promotionsError}</p>
          <button type="button" onClick={() => setPromotionRetry((value) => value + 1)} className={secondaryButtonClass}>Tải lại</button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Chương trình</h2>
              {!promotionsLoading && !promotionsError && <p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">{promotions.length} chương trình</p>}
            </div>
            <button type="button" onClick={() => setPromotionRetry((value) => value + 1)} disabled={busy} aria-label="Tải lại chương trình" className="rounded-lg border border-outline-variant p-2 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50">
              <span aria-hidden="true" className="material-symbols-outlined">refresh</span>
            </button>
          </div>
          {promotionsLoading && promotions.length === 0 && <p role="status" className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Đang tải chương trình…</p>}
          {!promotionsLoading && !promotionsError && promotions.length === 0 && <p className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Chưa có chương trình. Hãy tạo chương trình đầu tiên.</p>}
          {promotions.length > 0 && (
            <ul className="divide-y divide-outline-variant">
              {promotions.map((promotion) => (
                <li key={promotion.promotionId} className={`p-4 ${selectedPromotionId === promotion.promotionId ? 'bg-primary-container/30' : ''}`}>
                  <button type="button" onClick={() => { clearFeedback(); setSelectedPromotionId(promotion.promotionId); setVoucherFormOpen(false); }} disabled={busy} aria-pressed={selectedPromotionId === promotion.promotionId} className="w-full rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-label-md text-label-md font-bold text-on-surface">{promotion.name}</span>
                      <StatusBadge status={promotion.status} />
                    </span>
                    <span className="mt-1 block font-body-xs text-body-xs text-on-surface-variant">{promotion.startDate.slice(0, 10)} – {promotion.endDate.slice(0, 10)}</span>
                    {promotion.description && <span className="mt-1 block line-clamp-2 font-body-xs text-body-xs text-on-surface-variant">{promotion.description}</span>}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEditPromotion(promotion)} disabled={busy} className={secondaryButtonClass}>Chỉnh sửa</button>
                    <button type="button" onClick={() => void changePromotionStatus(promotion)} disabled={busy} className={secondaryButtonClass}>
                      {promotion.status === 'active' ? 'Ngừng áp dụng' : 'Kích hoạt lại'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Voucher</h2>
              <p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">{selectedPromotion ? `Thuộc chương trình: ${selectedPromotion.name}` : 'Chọn chương trình để xem voucher.'}</p>
            </div>
            <button type="button" onClick={startCreateVoucher} disabled={busy || selectedPromotionId === null} className={primaryButtonClass}>
              <span aria-hidden="true" className="material-symbols-outlined mr-2 text-[20px]">add</span>
              Tạo voucher
            </button>
          </div>

          {voucherFormOpen && selectedPromotion && (
            <form onSubmit={saveVoucher} className="border-b border-outline-variant bg-surface-container-low/50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-label-md text-label-md font-bold text-on-surface">{editingVoucherId === null ? 'Tạo voucher' : `Sửa voucher #${editingVoucherId}`}</h3>
                  <p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">Máy chủ là nguồn quyết định tính hợp lệ và mức giảm cuối cùng.</p>
                </div>
                <button type="button" onClick={() => setVoucherFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Đóng biểu mẫu</button>
              </div>
              {editingVoucherId !== null ? (
                <p className="mt-4 rounded-lg bg-surface p-3 font-body-sm text-body-sm text-on-surface">Mã voucher cố định: <strong>{voucherDraft.code}</strong></p>
              ) : (
                <label className={`${labelClass} mt-4`}>Mã voucher
                  <input required maxLength={64} autoCapitalize="characters" value={voucherDraft.code} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, code: event.target.value }))} className={fieldClass} placeholder="Ví dụ: TET10" />
                  <span className="mt-1 block font-body-xs text-body-xs font-normal text-on-surface-variant">Chữ hoa/thường được máy chủ chuẩn hóa. Mã trùng toàn hệ thống sẽ bị từ chối.</span>
                </label>
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className={labelClass}>Tên voucher
                  <input required maxLength={120} value={voucherDraft.name} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, name: event.target.value }))} className={fieldClass} />
                </label>
                <label className={labelClass}>Loại giảm
                  <select value={voucherDraft.type} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, type: event.target.value as VoucherDraft['type'], maxDiscount: event.target.value === 'fixed' ? '' : draft.maxDiscount }))} className={fieldClass}>
                    <option value="fixed">Số tiền cố định</option>
                    <option value="percentage">Phần trăm</option>
                  </select>
                </label>
                <label className={labelClass}>{voucherDraft.type === 'percentage' ? 'Tỷ lệ giảm (%)' : 'Số tiền giảm (VND)'}
                  <input required type="text" inputMode="decimal" value={voucherDraft.discountValue} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, discountValue: event.target.value }))} className={fieldClass} placeholder={voucherDraft.type === 'percentage' ? '10.00' : '50000.00'} />
                </label>
                <label className={labelClass}>Đơn tối thiểu (VND)
                  <input required type="text" inputMode="decimal" value={voucherDraft.minPrice} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, minPrice: event.target.value }))} className={fieldClass} placeholder="0.00" />
                </label>
                <label className={labelClass}>Mức giảm tối đa (VND) <span className="font-normal text-on-surface-variant">(tùy chọn, chỉ áp dụng cho phần trăm)</span>
                  <input type="text" inputMode="decimal" value={voucherDraft.maxDiscount} disabled={busy || voucherDraft.type !== 'percentage'} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, maxDiscount: event.target.value }))} className={fieldClass} placeholder="Để trống nếu không giới hạn" />
                </label>
                <label className={labelClass}>Tổng lượt sử dụng
                  <input required type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={voucherDraft.quantity} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, quantity: event.target.value }))} className={fieldClass} />
                </label>
                <label className={labelClass}>Ngày bắt đầu
                  <input required type="date" value={voucherDraft.startDate} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, startDate: event.target.value }))} className={fieldClass} />
                </label>
                <label className={labelClass}>Ngày kết thúc
                  <input required type="date" value={voucherDraft.endDate} disabled={busy} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, endDate: event.target.value }))} className={fieldClass} />
                </label>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Đang lưu…' : 'Lưu voucher'}</button>
                <button type="button" onClick={() => setVoucherFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Hủy</button>
              </div>
            </form>
          )}

          {selectedPromotionId === null && <p className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Chọn một chương trình ở danh sách bên trái.</p>}
          {selectedPromotionId !== null && (!vouchersMatchSelection || vouchersLoading) && <p role="status" className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Đang tải voucher…</p>}
          {vouchersMatchSelection && !vouchersLoading && vouchersError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-destructive">
              <p className="font-body-sm text-body-sm">{vouchersError}</p>
              <button type="button" onClick={() => setVoucherRetry((value) => value + 1)} className={secondaryButtonClass}>Tải lại voucher</button>
            </div>
          )}
          {vouchersMatchSelection && !vouchersLoading && !vouchersError && vouchers.length === 0 && <p className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Chương trình này chưa có voucher.</p>}
          {vouchersMatchSelection && !vouchersLoading && !vouchersError && vouchers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-surface-container-low font-label-xs text-label-xs uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Mã / voucher</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Mức giảm / đơn tối thiểu</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Thời hạn / lượt</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {vouchers.map((voucher) => (
                    <tr key={voucher.voucherId} className="align-top hover:bg-surface-container-low/60">
                      <td className="px-4 py-3.5">
                        <span className="block font-mono text-sm font-bold text-primary">{voucher.code}</span>
                        <span className="mt-1 block font-label-sm text-label-sm font-semibold text-on-surface">{voucher.name}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block font-label-sm text-label-sm font-semibold text-on-surface">{voucher.type === 'percentage' ? `${voucher.discountValue}%${voucher.maxDiscount ? ` · tối đa ${formatMoney(voucher.maxDiscount)}` : ''}` : formatMoney(voucher.discountValue)}</span>
                        <span className="mt-1 block font-body-xs text-body-xs text-on-surface-variant">Đơn tối thiểu {formatMoney(voucher.minPrice)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block whitespace-nowrap font-body-xs text-body-xs text-on-surface-variant">{voucher.startDate.slice(0, 10)} – {voucher.endDate.slice(0, 10)}</span>
                        <span className="mt-1 block font-body-xs text-body-xs text-on-surface-variant">Tổng lượt: {voucher.quantity.toLocaleString('vi-VN')}</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={voucher.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => startEditVoucher(voucher)} disabled={busy} className={secondaryButtonClass}>Sửa</button>
                          <button type="button" onClick={() => void changeVoucherStatus(voucher)} disabled={busy} className={secondaryButtonClass}>
                            {voucher.status === 'active' ? 'Ngừng' : 'Kích hoạt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
