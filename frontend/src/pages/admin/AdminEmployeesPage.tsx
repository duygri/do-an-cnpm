import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { EmployeeRecord, EmployeeRole, EmployeeStatus, PaginatedResult } from '../../types';

const PAGE_SIZE = 20;

const roles: { value: EmployeeRole; label: string }[] = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'manager', label: 'Quản lý vận hành' },
];

const fieldClass = 'mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-sans text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'block font-sans text-label-sm font-semibold text-on-surface';
const primaryButtonClass = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-sans text-label-sm font-bold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2.5 font-sans text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50';

type EmployeeDraft = {
  name: string;
  email: string;
  password: string;
  phone: string;
  position: string;
  role: EmployeeRole;
};

const emptyDraft: EmployeeDraft = {
  name: '',
  email: '',
  password: '',
  phone: '',
  position: '',
  role: 'manager',
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'active' ? 'bg-success-soft text-success' : 'bg-surface-container-high text-on-surface-variant'}`}>
      {status === 'active' ? 'Đang hoạt động' : 'Đã khóa'}
    </span>
  );
}

export const AdminEmployeesPage: React.FC = () => {
  const { employee: signedInEmployee } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [listResult, setListResult] = useState<PaginatedResult<EmployeeRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<EmployeeDraft>(emptyDraft);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const loadEmployees = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.getEmployees({ page, limit: PAGE_SIZE });
      if (requestId === requestSequence.current) {
        setListResult(result);
        setEmployees(result.items);
      }
    } catch (error: unknown) {
      if (requestId === requestSequence.current) {
        setLoadError(errorMessage(error, 'Không thể tải danh sách nhân viên.'));
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees, reloadVersion]);

  const clearFeedback = () => {
    setActionError(null);
    setNotice(null);
  };

  const createEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setActionId('create');
    try {
      await api.createEmployee({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        phone: draft.phone.trim() || undefined,
        position: draft.position.trim(),
        role: draft.role,
      });

      // A newly created employee is last in the API's employeeId ordering.
      const lastPage = Math.ceil(((listResult?.total ?? 0) + 1) / PAGE_SIZE) || 1;
      requestSequence.current += 1;
      setFormOpen(false);
      setDraft(emptyDraft);
      setPage(lastPage);
      setNotice('Đã tạo tài khoản nhân viên. Tài khoản mới đang ở trạng thái hoạt động.');
      setReloadVersion((value) => value + 1);
    } catch (error: unknown) {
      // Keep the draft intact so the administrator can correct or retry it.
      setActionError(errorMessage(error, 'Không thể tạo tài khoản nhân viên.'));
    } finally {
      setActionId(null);
    }
  };

  const updateAccess = async (
    target: EmployeeRecord,
    change: { role: EmployeeRole } | { status: EmployeeStatus },
  ) => {
    clearFeedback();
    setActionId(`employee-${target.employeeId}`);
    try {
      const saved = await api.updateEmployeeAccess(target.employeeId, change);
      // The response is the server's canonical projection. Invalidate any older list GET
      // before updating local state; a conflict leaves the row exactly as it was.
      requestSequence.current += 1;
      setEmployees((current) => current.map((item) => (
        item.employeeId === saved.employeeId ? saved : item
      )));
      setListResult((current) => current ? {
        ...current,
        items: current.items.map((item) => item.employeeId === saved.employeeId ? saved : item),
      } : current);
      setNotice(`Đã cập nhật quyền truy cập của ${saved.name}.`);
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể cập nhật quyền truy cập.'));
    } finally {
      setActionId(null);
    }
  };

  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (listResult?.limit || PAGE_SIZE)));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-sans text-label-sm font-bold uppercase tracking-[0.16em] text-primary">Quản trị hệ thống</p>
          <h2 className="mt-1 font-sans text-headline-lg font-bold text-on-surface">Tài khoản nhân viên</h2>
          <p className="mt-2 max-w-2xl font-sans text-body-sm text-on-surface-variant">
            Tạo tài khoản và phân quyền theo nghiệp vụ. Chức danh chỉ dùng để mô tả công việc; quyền truy cập được quyết định bởi vai trò.
          </p>
        </div>
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => { clearFeedback(); setFormOpen((open) => !open); }}
          disabled={actionId !== null}
        >
          <span aria-hidden="true" className="material-symbols-outlined mr-2 text-[20px]">{formOpen ? 'close' : 'person_add'}</span>
          {formOpen ? 'Đóng biểu mẫu' : 'Thêm nhân viên'}
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl border border-success/20 bg-success-soft px-4 py-3 font-sans text-body-sm text-success">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 font-sans text-body-sm text-destructive">{actionError}</p>}

      {formOpen && (
        <section className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h3 className="font-sans text-headline-sm font-bold text-on-surface">Tạo tài khoản nhân viên</h3>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Mật khẩu phải dài từ 12 đến 128 ký tự. Tài khoản được tạo ở trạng thái hoạt động.</p>
          </div>
          <form onSubmit={createEmployee} className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Họ và tên
              <input className={fieldClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} minLength={1} maxLength={120} required disabled={actionId !== null} />
            </label>
            <label className={labelClass}>
              Email
              <input className={fieldClass} type="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} maxLength={254} required disabled={actionId !== null} />
            </label>
            <label className={labelClass}>
              Mật khẩu ban đầu
              <input className={fieldClass} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} minLength={12} maxLength={128} required disabled={actionId !== null} />
            </label>
            <label className={labelClass}>
              Điện thoại <span className="font-normal text-on-surface-variant">(không bắt buộc)</span>
              <input className={fieldClass} type="tel" autoComplete="off" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} maxLength={30} disabled={actionId !== null} />
            </label>
            <label className={labelClass}>
              Chức danh
              <input className={fieldClass} value={draft.position} onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))} minLength={1} maxLength={80} required disabled={actionId !== null} />
            </label>
            <label className={labelClass}>
              Vai trò
              <select className={fieldClass} value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as EmployeeRole }))} disabled={actionId !== null}>
                {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button type="submit" className={primaryButtonClass} disabled={actionId !== null}>
                {actionId === 'create' ? 'Đang tạo…' : 'Tạo tài khoản'}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => { setFormOpen(false); setDraft(emptyDraft); clearFeedback(); }} disabled={actionId !== null}>
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-outline-variant px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-sans text-headline-sm font-bold text-on-surface">Danh sách nhân viên</h3>
            <p className="mt-1 font-sans text-body-xs text-on-surface-variant">{total} tài khoản · Trang {page} / {totalPages}</p>
          </div>
          <button type="button" className={secondaryButtonClass} onClick={() => setReloadVersion((value) => value + 1)} disabled={loading || actionId !== null}>
            <span aria-hidden="true" className="material-symbols-outlined mr-2 text-[18px]">refresh</span>
            Tải lại
          </button>
        </div>

        {loadError ? (
          <div className="p-6 text-center">
            <p role="alert" className="font-sans text-body-sm text-destructive">{loadError}</p>
            <p className="mt-1 font-sans text-body-xs text-on-surface-variant">API từ chối hoặc không thể hoàn tất yêu cầu. Chỉ tài khoản admin có thể quản lý nhân viên.</p>
            <button type="button" className={`${secondaryButtonClass} mt-4`} onClick={() => setReloadVersion((value) => value + 1)}>Thử lại</button>
          </div>
        ) : loading ? (
          <div role="status" className="p-8 text-center font-sans text-body-sm text-on-surface-variant">Đang tải danh sách nhân viên…</div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center font-sans text-body-sm text-on-surface-variant">Chưa có nhân viên trong hệ thống.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-surface-container-low font-sans text-label-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th scope="col" className="px-4 py-3">Nhân viên</th>
                  <th scope="col" className="px-4 py-3">Chức danh</th>
                  <th scope="col" className="px-4 py-3">Vai trò truy cập</th>
                  <th scope="col" className="px-4 py-3">Trạng thái</th>
                  <th scope="col" className="px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {employees.map((item) => {
                  const busy = actionId === `employee-${item.employeeId}`;
                  const isCurrent = item.employeeId === signedInEmployee?.employeeId;
                  const nextStatus: EmployeeStatus = item.status === 'active' ? 'inactive' : 'active';
                  return (
                    <tr key={item.employeeId} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-sans text-label-sm font-bold text-on-surface">{item.name}{isCurrent && <span className="ml-2 rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-semibold text-on-primary-container">Bạn</span>}</div>
                        <div className="mt-1 font-sans text-body-xs text-on-surface-variant">#{item.employeeId} · {item.email}</div>
                        <div className="mt-1 font-sans text-body-xs text-on-surface-variant">{item.phone || 'Chưa có số điện thoại'}</div>
                      </td>
                      <td className="px-4 py-4 font-sans text-body-sm text-on-surface">{item.position}</td>
                      <td className="px-4 py-4">
                        <label className="sr-only" htmlFor={`employee-role-${item.employeeId}`}>Vai trò của {item.name}</label>
                        <select
                          id={`employee-role-${item.employeeId}`}
                          className={`${fieldClass} mt-0 min-w-56`}
                          value={item.role}
                          disabled={actionId !== null}
                          onChange={(event) => { void updateAccess(item, { role: event.target.value as EmployeeRole }); }}
                        >
                          {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          disabled={actionId !== null}
                          onClick={() => { void updateAccess(item, { status: nextStatus }); }}
                          aria-label={`${nextStatus === 'active' ? 'Kích hoạt' : 'Khóa'} tài khoản ${item.name}`}
                        >
                          {busy ? 'Đang lưu…' : nextStatus === 'active' ? 'Kích hoạt' : 'Khóa tài khoản'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loadError && totalPages > 1 && (
          <nav aria-label="Phân trang danh sách nhân viên" className="flex items-center justify-between border-t border-outline-variant px-5 py-4">
            <span className="font-sans text-body-xs text-on-surface-variant">{listResult?.page} / {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1 || actionId !== null}>Trang trước</button>
              <button type="button" className={secondaryButtonClass} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={loading || page >= totalPages || actionId !== null}>Trang sau</button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
};
