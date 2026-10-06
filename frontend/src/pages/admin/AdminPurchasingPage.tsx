import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, CreateImportDetailRequest } from '../../services/api';
import { ImportRecord, ProductVariant, StoreProductDetail, StoreProductSummary, Supplier } from '../../types';

type SupplierDraft = { name: string; address: string; email: string };
type ImportLineDraft = { productId: string; variantId: string; quantity: string; unitPrice: string };
type ProductLookup = { detail?: StoreProductDetail; error?: string; loading?: boolean };

const emptySupplier: SupplierDraft = { name: '', address: '', email: '' };
const emptyImportLine = (): ImportLineDraft => ({ productId: '', variantId: '', quantity: '1', unitPrice: '' });
const fieldClass = 'mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'block font-label-sm text-label-sm font-semibold text-on-surface';
const primaryButtonClass = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-label-sm text-label-sm font-bold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2.5 font-label-sm text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50';
const importAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatMoney(value: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return `${value} ₫`;
  const groupedWhole = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${groupedWhole}${match[2] ? `,${match[2].padEnd(2, '0')}` : ''} ₫`;
}

function variantLabel(variant: ProductVariant): string {
  const attributes = [variant.size, variant.color].filter(Boolean).join(' · ');
  return attributes ? `${attributes} · mã biến thể ${variant.variantId}` : `Mã biến thể ${variant.variantId}`;
}

export const AdminPurchasingPage: React.FC<{ section?: 'all' | 'imports' }> = ({ section = 'all' }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
  const [supplierRetry, setSupplierRetry] = useState(0);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>(emptySupplier);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);

  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [importsLoading, setImportsLoading] = useState(true);
  const [importsError, setImportsError] = useState<string | null>(null);
  const [importRetry, setImportRetry] = useState(0);
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [selectedImport, setSelectedImport] = useState<ImportRecord | null>(null);
  const [importDetailLoading, setImportDetailLoading] = useState(false);
  const [importDetailError, setImportDetailError] = useState<string | null>(null);
  const [importDetailRetry, setImportDetailRetry] = useState(0);

  const [importFormOpen, setImportFormOpen] = useState(false);
  const [importSupplierId, setImportSupplierId] = useState('');
  const [importNote, setImportNote] = useState('');
  const [importLines, setImportLines] = useState<ImportLineDraft[]>([emptyImportLine()]);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogProducts, setCatalogProducts] = useState<StoreProductSummary[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [productLookups, setProductLookups] = useState<Record<number, ProductLookup>>({});
  const [productLookupRetry, setProductLookupRetry] = useState(0);

  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const supplierRequest = useRef(0);
  const importRequest = useRef(0);
  const detailRequest = useRef(0);
  const catalogRequest = useRef(0);
  const requestedProductIds = useRef(new Set<number>());

  const loadSuppliers = useCallback(async () => {
    const requestId = ++supplierRequest.current;
    setSuppliersLoading(true);
    setSuppliersError(null);
    try {
      const result = await api.getSuppliers();
      if (requestId === supplierRequest.current) setSuppliers(result);
    } catch (error: unknown) {
      if (requestId === supplierRequest.current) setSuppliersError(errorMessage(error, 'Không thể tải nhà cung cấp.'));
    } finally {
      if (requestId === supplierRequest.current) setSuppliersLoading(false);
    }
  }, []);

  useEffect(() => { void loadSuppliers(); }, [loadSuppliers, supplierRetry]);

  const loadImports = useCallback(async () => {
    const requestId = ++importRequest.current;
    setImportsLoading(true);
    setImportsError(null);
    try {
      const result = await api.getImports();
      if (requestId === importRequest.current) setImports(result);
    } catch (error: unknown) {
      if (requestId === importRequest.current) setImportsError(errorMessage(error, 'Không thể tải phiếu nhập.'));
    } finally {
      if (requestId === importRequest.current) setImportsLoading(false);
    }
  }, []);

  useEffect(() => { void loadImports(); }, [loadImports, importRetry]);

  useEffect(() => {
    if (selectedImportId === null) {
      setSelectedImport(null);
      setImportDetailError(null);
      setImportDetailLoading(false);
      return;
    }
    const requestId = ++detailRequest.current;
    setImportDetailLoading(true);
    setImportDetailError(null);
    void api.getImport(selectedImportId).then((result) => {
      if (requestId === detailRequest.current) setSelectedImport(result);
    }).catch((error: unknown) => {
      if (requestId === detailRequest.current) setImportDetailError(errorMessage(error, 'Không thể tải chi tiết phiếu nhập.'));
    }).finally(() => {
      if (requestId === detailRequest.current) setImportDetailLoading(false);
    });
    return () => { detailRequest.current += 1; };
  }, [selectedImportId, importDetailRetry]);

  useEffect(() => {
    const requestId = ++catalogRequest.current;
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      setCatalogError(null);
      void api.getStoreProducts({ page: catalogPage, limit: 100, q: catalogSearch.trim() || undefined }).then((result) => {
        if (requestId !== catalogRequest.current) return;
        setCatalogProducts(result.items);
        setCatalogTotal(result.total);
      }).catch((error: unknown) => {
        if (requestId === catalogRequest.current) setCatalogError(errorMessage(error, 'Không thể tải danh sách sản phẩm để chọn biến thể.'));
      }).finally(() => {
        if (requestId === catalogRequest.current) setCatalogLoading(false);
      });
    }, 200);
    return () => { window.clearTimeout(timer); };
  }, [catalogPage, catalogSearch, catalogRetry]);

  const selectedProductIds = useMemo(() => Array.from(new Set(importLines
    .map((line) => Number(line.productId))
    .filter((id) => Number.isSafeInteger(id) && id > 0))), [importLines]);

  useEffect(() => {
    const missing = selectedProductIds.filter((productId) => !requestedProductIds.current.has(productId));
    if (missing.length === 0) return;
    missing.forEach((productId) => requestedProductIds.current.add(productId));
    setProductLookups((current) => ({
      ...current,
      ...Object.fromEntries(missing.map((productId) => [productId, { loading: true } satisfies ProductLookup])),
    }));
    void Promise.all(missing.map(async (productId) => {
      try {
        const detail = await api.getStoreProduct(productId);
        setProductLookups((current) => ({ ...current, [productId]: { detail } }));
      } catch (error: unknown) {
        setProductLookups((current) => ({ ...current, [productId]: { error: errorMessage(error, 'Không thể tải biến thể của sản phẩm.') } }));
      }
    }));
  }, [selectedProductIds, productLookupRetry]);

  const clearFeedback = () => { setActionError(null); setNotice(null); };

  const startCreateSupplier = () => {
    clearFeedback();
    setEditingSupplierId(null);
    setSupplierDraft(emptySupplier);
    setSupplierFormOpen(true);
  };

  const startEditSupplier = (supplier: Supplier) => {
    clearFeedback();
    setEditingSupplierId(supplier.supplierId);
    setSupplierDraft({ name: supplier.name, address: supplier.address ?? '', email: supplier.email ?? '' });
    setSupplierFormOpen(true);
  };

  const saveSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    const isEditing = editingSupplierId !== null;
    const data = {
      name: supplierDraft.name.trim(),
      address: supplierDraft.address.trim() || null,
      email: supplierDraft.email.trim() || null,
    };
    setActionId('supplier-save');
    try {
      const saved = isEditing
        ? await api.updateSupplier(editingSupplierId!, data)
        : await api.createSupplier(data);
      setSuppliers((current) => isEditing
        ? current.map((supplier) => supplier.supplierId === saved.supplierId ? saved : supplier)
        : [...current, saved].sort((left, right) => left.supplierId - right.supplierId));
      setSupplierFormOpen(false);
      setEditingSupplierId(null);
      setSupplierDraft(emptySupplier);
      await loadSuppliers();
      setNotice(isEditing ? 'Đã cập nhật nhà cung cấp.' : 'Đã tạo nhà cung cấp.');
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể lưu nhà cung cấp. Dữ liệu đã nhập được giữ lại.'));
    } finally {
      setActionId(null);
    }
  };

  const deleteSupplier = async (supplier: Supplier) => {
    if (!window.confirm(`Xóa nhà cung cấp “${supplier.name}”?`)) return;
    clearFeedback();
    setActionId(`supplier-delete-${supplier.supplierId}`);
    try {
      await api.deleteSupplier(supplier.supplierId);
      setSuppliers((current) => current.filter((item) => item.supplierId !== supplier.supplierId));
      await loadSuppliers();
      setNotice('Đã xóa nhà cung cấp.');
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể xóa nhà cung cấp. Máy chủ có thể từ chối nếu đã có phiếu nhập tham chiếu.'));
    } finally {
      setActionId(null);
    }
  };

  const startCreateImport = () => {
    clearFeedback();
    setImportSupplierId(suppliers[0] ? String(suppliers[0].supplierId) : '');
    setImportNote('');
    setImportLines([emptyImportLine()]);
    setImportFormOpen(true);
    setSelectedImportId(null);
  };

  const updateImportLine = (index: number, changes: Partial<ImportLineDraft>) => {
    setImportLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line));
  };

  const submitImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    const details: CreateImportDetailRequest[] = importLines.map((line) => ({
      variantId: Number(line.variantId),
      quantity: Number(line.quantity),
      unitPrice: line.unitPrice.trim(),
    }));
    if (!importSupplierId || details.length < 1 || details.length > 100) {
      setActionError('Chọn nhà cung cấp và nhập từ 1 đến 100 dòng phiếu.');
      return;
    }
    if (details.some((detail) => !Number.isSafeInteger(detail.variantId) || detail.variantId < 1 || !Number.isSafeInteger(detail.quantity) || detail.quantity < 1 || !importAmountPattern.test(detail.unitPrice))) {
      setActionError('Mỗi dòng cần có biến thể, số lượng nguyên dương và đơn giá không âm với tối đa 2 chữ số thập phân.');
      return;
    }
    if (new Set(details.map((detail) => detail.variantId)).size !== details.length) {
      setActionError('Mỗi biến thể chỉ được xuất hiện một lần trong một phiếu nhập.');
      return;
    }
    setActionId('import-create');
    try {
      const created = await api.createImport({ supplierId: Number(importSupplierId), note: importNote.trim() || null, details });
      setImportFormOpen(false);
      setImportSupplierId('');
      setImportNote('');
      setImportLines([emptyImportLine()]);
      setSelectedImportId(created.importId);
      setSelectedImport(created);
      setImportDetailError(null);
      setNotice('Đã tạo phiếu nhập. Tổng tiền và thành tiền dưới đây lấy từ phản hồi máy chủ.');
      setImportRetry((value) => value + 1);
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể tạo phiếu nhập. Bản nháp vẫn được giữ để bạn chỉnh sửa.'));
    } finally {
      setActionId(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(catalogTotal / 100));
  const busy = actionId !== null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-label-xs text-label-xs font-bold uppercase tracking-[0.16em] text-primary">Quản lý mua hàng</p>
          <h1 className="mt-1 font-headline-md text-headline-md font-bold text-on-surface">{section === 'imports' ? 'Phiếu nhập' : 'Nhà cung cấp và phiếu nhập'}</h1>
          <p className="mt-2 max-w-3xl font-body-sm text-body-sm text-on-surface-variant">Lưu chứng từ mua hàng. Phiếu nhập là hồ sơ bất biến sau khi tạo; số lượng trong phiếu không được dùng để suy ra hàng sẵn có.</p>
        </div>
        <button type="button" onClick={startCreateImport} disabled={busy || suppliers.length === 0} className={primaryButtonClass}>
          <span aria-hidden="true" className="material-symbols-outlined mr-2 text-[20px]">add</span>
          Tạo phiếu nhập
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl border border-success/20 bg-success-soft px-4 py-3 font-body-sm text-body-sm text-success">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive-soft px-4 py-3 font-body-sm text-body-sm text-destructive">{actionError}</p>}

      {section !== 'imports' && <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Nhà cung cấp</h2>
            {!suppliersLoading && !suppliersError && <p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">{suppliers.length} nhà cung cấp</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={startCreateSupplier} disabled={busy} className={primaryButtonClass}>Thêm nhà cung cấp</button>
            <button type="button" onClick={() => setSupplierRetry((value) => value + 1)} disabled={busy} aria-label="Tải lại nhà cung cấp" className={`${secondaryButtonClass} px-2.5`}><span aria-hidden="true" className="material-symbols-outlined">refresh</span></button>
          </div>
        </div>

        {supplierFormOpen && (
          <form onSubmit={saveSupplier} className="border-b border-outline-variant bg-surface-container-low/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-label-md text-label-md font-bold text-on-surface">{editingSupplierId === null ? 'Thêm nhà cung cấp' : `Cập nhật nhà cung cấp #${editingSupplierId}`}</h3>
              <button type="button" onClick={() => setSupplierFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Đóng biểu mẫu</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className={labelClass}>Tên nhà cung cấp
                <input required maxLength={160} value={supplierDraft.name} disabled={busy} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, name: event.target.value }))} className={fieldClass} />
              </label>
              <label className={labelClass}>Email <span className="font-normal text-on-surface-variant">(tùy chọn)</span>
                <input type="email" maxLength={254} value={supplierDraft.email} disabled={busy} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, email: event.target.value }))} className={fieldClass} />
              </label>
              <label className={labelClass}>Địa chỉ <span className="font-normal text-on-surface-variant">(tùy chọn)</span>
                <input maxLength={5000} value={supplierDraft.address} disabled={busy} onChange={(event) => setSupplierDraft((draft) => ({ ...draft, address: event.target.value }))} className={fieldClass} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Đang lưu…' : 'Lưu nhà cung cấp'}</button>
              <button type="button" onClick={() => setSupplierFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Hủy</button>
            </div>
          </form>
        )}

        {suppliersError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-destructive"><p className="font-body-sm text-body-sm">{suppliersError}</p><button type="button" onClick={() => setSupplierRetry((value) => value + 1)} className={secondaryButtonClass}>Tải lại</button></div>}
        {suppliersLoading && suppliers.length === 0 && <p role="status" className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Đang tải nhà cung cấp…</p>}
        {!suppliersLoading && !suppliersError && suppliers.length === 0 && <p className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Chưa có nhà cung cấp. Hãy thêm nhà cung cấp trước khi lập phiếu nhập.</p>}
        {suppliers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-surface-container-low font-label-xs text-label-xs uppercase tracking-wide text-on-surface-variant"><tr><th scope="col" className="px-4 py-3 font-semibold">Nhà cung cấp</th><th scope="col" className="px-4 py-3 font-semibold">Email</th><th scope="col" className="px-4 py-3 font-semibold">Địa chỉ</th><th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th></tr></thead>
              <tbody className="divide-y divide-outline-variant">
                {suppliers.map((supplier) => (
                  <tr key={supplier.supplierId} className="align-top hover:bg-surface-container-low/60">
                    <td className="px-4 py-3.5"><span className="block font-label-sm text-label-sm font-bold text-on-surface">{supplier.name}</span><span className="mt-1 block font-body-xs text-body-xs text-on-surface-variant">Mã nhà cung cấp {supplier.supplierId}</span></td>
                    <td className="px-4 py-3.5 font-body-sm text-body-sm text-on-surface-variant">{supplier.email || '—'}</td>
                    <td className="px-4 py-3.5 font-body-sm text-body-sm text-on-surface-variant">{supplier.address || '—'}</td>
                    <td className="px-4 py-3.5"><div className="flex justify-end gap-2"><button type="button" onClick={() => startEditSupplier(supplier)} disabled={busy} className={secondaryButtonClass}>Sửa</button><button type="button" onClick={() => void deleteSupplier(supplier)} disabled={busy} className={secondaryButtonClass}>{actionId === `supplier-delete-${supplier.supplierId}` ? 'Đang xóa…' : 'Xóa'}</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {importFormOpen && (
        <form onSubmit={submitImport} className="space-y-5 rounded-2xl border border-primary/20 bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Lập phiếu nhập</h2><p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">Chọn biến thể từ catalog storefront đang hoạt động hoặc nhập mã biến thể đã biết. Máy chủ kiểm tra mã khi lưu. Phiếu đã lưu không thể sửa hoặc xóa.</p></div>
            <button type="button" onClick={() => setImportFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Đóng biểu mẫu</button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>Nhà cung cấp
              <select required value={importSupplierId} disabled={busy || suppliers.length === 0} onChange={(event) => setImportSupplierId(event.target.value)} className={fieldClass}>
                <option value="">Chọn nhà cung cấp</option>
                {suppliers.map((supplier) => <option key={supplier.supplierId} value={supplier.supplierId}>{supplier.name} · #{supplier.supplierId}</option>)}
              </select>
            </label>
            <label className={labelClass}>Ghi chú <span className="font-normal text-on-surface-variant">(tùy chọn)</span>
              <input maxLength={2000} value={importNote} disabled={busy} onChange={(event) => setImportNote(event.target.value)} className={fieldClass} />
            </label>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h3 className="font-label-md text-label-md font-bold text-on-surface">Sản phẩm để chọn</h3><p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">Danh sách lấy từ catalog storefront, gồm sản phẩm đang hoạt động.</p></div>
              <label className={`${labelClass} min-w-[220px] flex-1`}>Tìm sản phẩm
                <input value={catalogSearch} disabled={busy} onChange={(event) => { setCatalogSearch(event.target.value); setCatalogPage(1); }} className={fieldClass} placeholder="Tên hoặc thương hiệu" />
              </label>
              <button type="button" onClick={() => setCatalogRetry((value) => value + 1)} disabled={busy || catalogLoading} className={secondaryButtonClass}>Tải lại catalog</button>
            </div>
            {catalogLoading && <p role="status" className="mt-3 font-body-xs text-body-xs text-on-surface-variant">Đang tải sản phẩm…</p>}
            {catalogError && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-destructive"><p className="font-body-xs text-body-xs">{catalogError}</p><button type="button" onClick={() => setCatalogRetry((value) => value + 1)} className={secondaryButtonClass}>Thử lại</button></div>}
            {!catalogLoading && !catalogError && catalogProducts.length === 0 && <p className="mt-3 font-body-xs text-body-xs text-on-surface-variant">Không có sản phẩm phù hợp trong catalog storefront.</p>}
            <div className="mt-3 flex items-center justify-between gap-3 font-body-xs text-body-xs text-on-surface-variant">
              <span>{catalogTotal ? `Trang ${catalogPage}/${pageCount} · ${catalogTotal} sản phẩm phù hợp` : 'Chưa có kết quả'}</span>
              <div className="flex gap-2"><button type="button" onClick={() => setCatalogPage((page) => Math.max(1, page - 1))} disabled={busy || catalogLoading || catalogPage <= 1} className={secondaryButtonClass}>Trước</button><button type="button" onClick={() => setCatalogPage((page) => Math.min(pageCount, page + 1))} disabled={busy || catalogLoading || catalogPage >= pageCount} className={secondaryButtonClass}>Tiếp</button></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-label-md text-label-md font-bold text-on-surface">Chi tiết phiếu ({importLines.length}/100 dòng)</h3><button type="button" onClick={() => setImportLines((current) => current.length < 100 ? [...current, emptyImportLine()] : current)} disabled={busy || importLines.length >= 100} className={secondaryButtonClass}>Thêm dòng</button></div>
            {importLines.map((line, index) => {
              const productId = Number(line.productId);
              const lookup = productLookups[productId];
              const chosenProduct = catalogProducts.find((product) => product.productId === productId);
              const productLabel = lookup?.detail?.name ?? chosenProduct?.name;
              return (
                <div key={index} className="rounded-xl border border-outline-variant p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-label-sm text-label-sm font-bold text-on-surface">Dòng {index + 1}{productLabel ? ` · ${productLabel}` : ''}</p>{importLines.length > 1 && <button type="button" onClick={() => setImportLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={busy} className="font-label-xs text-label-xs font-semibold text-destructive hover:underline">Xóa dòng</button>}</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className={labelClass}>Sản phẩm <span className="font-normal text-on-surface-variant">(tùy chọn)</span>
                      <select value={line.productId} disabled={busy || catalogLoading || catalogProducts.length === 0} onChange={(event) => updateImportLine(index, { productId: event.target.value, variantId: '' })} className={fieldClass}>
                        <option value="">Chọn sản phẩm</option>
                        {line.productId && !catalogProducts.some((item) => item.productId === productId) && productLabel && <option value={productId}>{productLabel} · #{productId}</option>}
                        {catalogProducts.map((product) => <option key={product.productId} value={product.productId}>{product.name} · #{product.productId}</option>)}
                      </select>
                    </label>
                    <label className={labelClass}>Chọn biến thể <span className="font-normal text-on-surface-variant">(tùy chọn)</span>
                      <select value={line.variantId} disabled={busy || !line.productId || lookup?.loading || !lookup?.detail} onChange={(event) => updateImportLine(index, { variantId: event.target.value })} className={fieldClass}>
                        <option value="">{lookup?.loading ? 'Đang tải biến thể…' : 'Chọn biến thể'}</option>
                        {lookup?.detail?.variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variantLabel(variant)}</option>)}
                      </select>
                    </label>
                    <label className={labelClass}>Mã biến thể <span className="font-normal text-on-surface-variant">(chọn ở trên hoặc nhập mã đã biết)</span>
                      <input required type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={line.variantId} disabled={busy} onChange={(event) => updateImportLine(index, { variantId: event.target.value })} className={fieldClass} placeholder="Mã biến thể" />
                    </label>
                    <label className={labelClass}>Số lượng
                      <input required type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={line.quantity} disabled={busy} onChange={(event) => updateImportLine(index, { quantity: event.target.value })} className={fieldClass} />
                    </label>
                    <label className={labelClass}>Đơn giá mua (VND)
                      <input required type="text" inputMode="decimal" pattern="(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?" value={line.unitPrice} disabled={busy} onChange={(event) => updateImportLine(index, { unitPrice: event.target.value })} className={fieldClass} placeholder="Ví dụ: 12500.00" />
                    </label>
                  </div>
                    {line.productId && lookup?.error && <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-destructive"><p className="font-body-xs text-body-xs">{lookup.error}</p><button type="button" onClick={() => { requestedProductIds.current.delete(productId); setProductLookups((current) => { const next = { ...current }; delete next[productId]; return next; }); setProductLookupRetry((value) => value + 1); }} className={secondaryButtonClass}>Tải lại biến thể</button></div>}
                </div>
              );
            })}
          </div>
          <p className="rounded-lg bg-surface-container-low px-3 py-2 font-body-xs text-body-xs text-on-surface-variant">Thành tiền từng dòng và tổng phiếu được tính ở máy chủ. Dữ liệu biểu mẫu sẽ được giữ lại nếu máy chủ từ chối phiếu.</p>
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || suppliers.length === 0} className={primaryButtonClass}>{busy ? 'Đang tạo phiếu…' : 'Lưu phiếu nhập'}</button><button type="button" onClick={() => setImportFormOpen(false)} disabled={busy} className={secondaryButtonClass}>Hủy</button></div>
        </form>
      )}

      <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.35fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-4 sm:px-5"><div><h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Phiếu nhập</h2>{!importsLoading && !importsError && <p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">{imports.length} chứng từ</p>}</div><button type="button" onClick={() => setImportRetry((value) => value + 1)} disabled={busy || importsLoading} aria-label="Tải lại phiếu nhập" className={`${secondaryButtonClass} px-2.5`}><span aria-hidden="true" className="material-symbols-outlined">refresh</span></button></div>
          {importsLoading && imports.length === 0 && <p role="status" className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Đang tải phiếu nhập…</p>}
          {importsError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-destructive"><p className="font-body-sm text-body-sm">{importsError}</p><button type="button" onClick={() => setImportRetry((value) => value + 1)} className={secondaryButtonClass}>Tải lại</button></div>}
          {!importsLoading && !importsError && imports.length === 0 && <p className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Chưa có phiếu nhập nào.</p>}
          {imports.length > 0 && <ul className="divide-y divide-outline-variant">{imports.map((record) => <li key={record.importId} className={`p-4 ${selectedImportId === record.importId ? 'bg-primary-container/30' : ''}`}><button type="button" onClick={() => { clearFeedback(); setSelectedImportId(record.importId); setImportFormOpen(false); }} className="w-full rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-primary/30"><span className="flex flex-wrap items-center justify-between gap-2"><span className="font-label-sm text-label-sm font-bold text-on-surface">Phiếu #{record.importId}</span><span className="font-label-sm text-label-sm font-bold text-on-surface">{formatMoney(record.totalAmount)}</span></span><span className="mt-1 block font-body-xs text-body-xs text-on-surface-variant">{new Date(record.importDate).toLocaleString('vi-VN')} · {record.supplier?.name ?? `Nhà cung cấp #${record.supplierId}`}</span></button></li>)}</ul>}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="border-b border-outline-variant px-4 py-4 sm:px-5"><h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Chi tiết chứng từ</h2><p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">Chọn phiếu để xem thông tin do API trả về.</p></div>
          {selectedImportId === null && <p className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Chưa chọn phiếu nhập.</p>}
          {importDetailLoading && <p role="status" className="p-8 text-center font-body-sm text-body-sm text-on-surface-variant">Đang tải chi tiết…</p>}
          {importDetailError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-destructive"><p className="font-body-sm text-body-sm">{importDetailError}</p><button type="button" onClick={() => setImportDetailRetry((value) => value + 1)} className={secondaryButtonClass}>Thử lại</button></div>}
          {!importDetailLoading && !importDetailError && selectedImport && <div className="p-4 sm:p-5" data-selected-import={selectedImport.importId}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-label-md text-label-md font-bold text-on-surface">Phiếu nhập #{selectedImport.importId}</h3><p className="mt-1 font-body-xs text-body-xs text-on-surface-variant">{new Date(selectedImport.importDate).toLocaleString('vi-VN')}</p></div><span className="rounded-lg bg-primary-container/50 px-3 py-2 font-label-sm text-label-sm font-bold text-on-primary-container">Tổng {formatMoney(selectedImport.totalAmount)}</span></div>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><div><dt className="font-label-xs text-label-xs font-semibold text-on-surface-variant">Nhà cung cấp</dt><dd className="mt-1 font-body-sm text-body-sm text-on-surface">{selectedImport.supplier?.name ?? `#${selectedImport.supplierId}`}</dd></div><div><dt className="font-label-xs text-label-xs font-semibold text-on-surface-variant">Nhân viên lập</dt><dd className="mt-1 font-body-sm text-body-sm text-on-surface">Mã nhân viên {selectedImport.employeeId}</dd></div>{selectedImport.note && <div className="sm:col-span-2"><dt className="font-label-xs text-label-xs font-semibold text-on-surface-variant">Ghi chú</dt><dd className="mt-1 whitespace-pre-wrap font-body-sm text-body-sm text-on-surface">{selectedImport.note}</dd></div>}</dl>
            <div className="mt-5 overflow-x-auto rounded-xl border border-outline-variant"><table className="w-full min-w-[620px] text-left"><thead className="bg-surface-container-low font-label-xs text-label-xs uppercase tracking-wide text-on-surface-variant"><tr><th scope="col" className="px-3 py-3 font-semibold">Biến thể</th><th scope="col" className="px-3 py-3 text-right font-semibold">Số lượng</th><th scope="col" className="px-3 py-3 text-right font-semibold">Đơn giá</th><th scope="col" className="px-3 py-3 text-right font-semibold">Thành tiền</th></tr></thead><tbody className="divide-y divide-outline-variant">{selectedImport.details?.map((detail) => <tr key={`${detail.importId}-${detail.variantId}`}><td className="px-3 py-3"><span className="block font-label-sm text-label-sm font-semibold text-on-surface">{detail.variant ? variantLabel(detail.variant) : `Mã biến thể ${detail.variantId}`}</span>{detail.variant?.productId && <span className="mt-1 block font-body-xs text-body-xs text-on-surface-variant">Mã sản phẩm {detail.variant.productId}</span>}</td><td className="px-3 py-3 text-right font-body-sm text-body-sm text-on-surface">{detail.quantity.toLocaleString('vi-VN')}</td><td className="px-3 py-3 text-right font-body-sm text-body-sm text-on-surface">{formatMoney(detail.unitPrice)}</td><td className="px-3 py-3 text-right font-label-sm text-label-sm font-bold text-on-surface">{formatMoney(detail.subtotal)}</td></tr>)}</tbody></table></div>
            <p className="mt-3 font-body-xs text-body-xs text-on-surface-variant">Thành tiền và tổng tiền là giá trị do máy chủ trả về khi tạo phiếu.</p>
          </div>}
        </section>
      </div>
    </div>
  );
};
