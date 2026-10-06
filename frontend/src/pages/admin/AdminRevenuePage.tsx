import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { MoneyAmount, RevenueReport } from '../../types';

function vietnamToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function currentVietnamMonth(): { from: string; to: string } {
  const today = vietnamToday();
  const [year, month] = today.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${today.slice(0, 8)}01`, to: `${today.slice(0, 5)}${String(days).padStart(2, '0')}` };
}

/** Adds grouping without parsing decimal money through JavaScript floating point. */
function formatMoney(value: MoneyAmount): string {
  const [wholeRaw, fraction] = value.split('.', 2);
  const negative = wholeRaw.startsWith('-');
  const whole = negative ? wholeRaw.slice(1) : wholeRaw;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function reportInitialState(): { from: string; to: string } {
  return currentVietnamMonth();
}

export const AdminRevenuePage: React.FC = () => {
  const initial = useMemo(reportInitialState, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextFrom = from, nextTo = to) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.getRevenueReport(nextFrom, nextTo));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải báo cáo doanh thu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(initial.from, initial.to); }, [initial.from, initial.to]);

  const maximumAmount = useMemo(() => Math.max(0, ...(report?.daily.map((entry) => Number(entry.amount)) ?? [])), [report]);

  return (
    <section className="space-y-6">
      <header>
        <p className="font-label-sm text-label-sm font-bold uppercase tracking-[0.16em] text-primary">Báo cáo nội bộ</p>
        <h2 className="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">Thống kê doanh thu</h2>
        <p className="mt-2 max-w-3xl font-body-md text-body-md text-on-surface-variant">Tổng tiền đơn đã thu, gồm phí giao hàng. Báo cáo này không phải hóa đơn thuế hoặc báo cáo kế toán.</p>
      </header>

      <form className="flex flex-wrap items-end gap-4 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label className="grid gap-1.5 font-label-sm text-label-sm font-semibold text-on-surface">
          Từ ngày
          <input aria-label="Từ ngày" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface" required />
        </label>
        <label className="grid gap-1.5 font-label-sm text-label-sm font-semibold text-on-surface">
          Đến ngày
          <input aria-label="Đến ngày" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-on-surface" required />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-5 py-2.5 font-label-sm text-label-sm font-semibold text-on-primary hover:opacity-90">Xem báo cáo</button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-error-container p-4 text-on-error-container">{error}</p>}
      {loading && <p className="text-on-surface-variant">Đang tải báo cáo doanh thu...</p>}

      {report && !loading && <>
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
            <p className="font-label-sm text-label-sm text-on-surface-variant">Tổng tiền đã thu</p>
            <p className="mt-2 font-headline-md text-headline-md font-bold text-on-surface">{formatMoney(report.collectedAmount)}</p>
          </article>
          <article className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
            <p className="font-label-sm text-label-sm text-on-surface-variant">Đơn đã thanh toán</p>
            <p className="mt-2 font-headline-md text-headline-md font-bold text-on-surface">{report.paidOrderCount}</p>
          </article>
        </div>

        <section className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
          <h3 className="font-title-lg text-title-lg font-bold text-on-surface">Theo ngày</h3>
          <div className="mt-4 space-y-3" aria-label="Biểu đồ doanh thu theo ngày">
            {report.daily.map((entry) => {
              const width = maximumAmount > 0 ? Math.max(0, Math.min(100, (Number(entry.amount) / maximumAmount) * 100)) : 0;
              return <div key={entry.date} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
                <span className="font-body-sm text-body-sm text-on-surface-variant">{displayDate(entry.date)}</span>
                <div className="h-3 overflow-hidden rounded-full bg-surface-container-high" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} /></div>
                <span className="font-label-sm text-label-sm font-semibold text-on-surface">{formatMoney(entry.amount)}</span>
              </div>;
            })}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <caption className="sr-only">Chi tiết tiền đã thu theo ngày</caption>
              <thead><tr className="border-b border-outline-variant text-on-surface-variant"><th className="p-3">Ngày</th><th className="p-3">Đơn đã thanh toán</th><th className="p-3">Tổng tiền đã thu</th></tr></thead>
              <tbody>{report.daily.map((entry) => <tr key={entry.date} className="border-b border-outline-variant/60"><td className="p-3">{displayDate(entry.date)}</td><td className="p-3">{entry.orderCount}</td><td className="p-3">{formatMoney(entry.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </>}
    </section>
  );
};
