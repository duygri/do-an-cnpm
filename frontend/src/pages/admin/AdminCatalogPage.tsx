import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import {
  Category,
  CreateCategoryRequest,
  CreateProductRequest,
  ProductImageInput,
  ProductResource,
  ProductVariant,
} from '../../types';

type CatalogSection = 'categories' | 'products';
type CategoryDraft = { name: string; description: string };
type ProductDraft = {
  name: string;
  categoryId: string;
  description: string;
  brand: string;
  status: string;
  images: ProductImageInput[];
};
type VariantDraft = { size: string; color: string; price: string };

const emptyCategory: CategoryDraft = { name: '', description: '' };
const emptyProduct: ProductDraft = {
  name: '', categoryId: '', description: '', brand: '', status: 'active', images: [],
};
const emptyVariant: VariantDraft = { size: '', color: '', price: '' };

const fieldClass = 'mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-sans text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const labelClass = 'block font-sans text-label-sm font-semibold text-on-surface';
const primaryButtonClass = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-sans text-label-sm font-bold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface px-4 py-2.5 font-sans text-label-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 2 }).format(amount)
    : value;
}

function categoryDraftFrom(category: Category): CategoryDraft {
  return { name: category.name, description: category.description ?? '' };
}

function productDraftFrom(product: ProductResource): ProductDraft {
  return {
    name: product.name,
    categoryId: String(product.categoryId),
    description: product.description ?? '',
    brand: product.brand ?? '',
    status: product.status || 'active',
    images: (product.images ?? []).map((image) => ({
      imageUrl: image.imageUrl,
      altText: image.altText,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    })),
  };
}

export const AdminCatalogPage: React.FC<{ section: CatalogSection; basePath: '/admin' }> = ({ section, basePath }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);
  const [variantFormId, setVariantFormId] = useState<number | null | undefined>(undefined);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(emptyVariant);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const catalogRequest = useRef(0);
  const variantsRequest = useRef(0);

  const loadCatalog = useCallback(async () => {
    const requestId = ++catalogRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [categoryResult, productResult] = await Promise.all([
        api.getManagedCategories(),
        api.getCatalogProducts(),
      ]);
      if (requestId === catalogRequest.current) {
        setCategories(categoryResult);
        setProducts(productResult);
      }
    } catch (error: unknown) {
      if (requestId === catalogRequest.current) {
        setLoadError(errorMessage(error, 'Không thể tải dữ liệu danh mục và sản phẩm.'));
      }
    } finally {
      if (requestId === catalogRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, retry]);

  const loadVariants = useCallback(async (productId: number) => {
    const requestId = ++variantsRequest.current;
    setVariantsLoading(true);
    setVariantsError(null);
    try {
      const result = await api.getProductVariants(productId);
      if (requestId === variantsRequest.current) setVariants(result);
    } catch (error: unknown) {
      if (requestId === variantsRequest.current) {
        setVariantsError(errorMessage(error, 'Không thể tải biến thể sản phẩm.'));
      }
    } finally {
      if (requestId === variantsRequest.current) setVariantsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProductId === null) {
      variantsRequest.current += 1;
      setVariants([]);
      setVariantsError(null);
      setVariantFormId(undefined);
      return;
    }
    void loadVariants(selectedProductId);
  }, [loadVariants, selectedProductId]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return products;
    return products.filter((product) => {
      const categoryName = product.category?.name ?? categories.find((item) => item.categoryId === product.categoryId)?.name ?? '';
      return [product.name, product.brand ?? '', categoryName, String(product.productId)]
        .some((value) => value.toLocaleLowerCase('vi').includes(query));
    });
  }, [categories, products, search]);

  const clearFeedback = () => {
    setActionError(null);
    setNotice(null);
  };

  const startCreateCategory = () => {
    clearFeedback();
    setEditingCategoryId(null);
    setCategoryDraft(emptyCategory);
    setCategoryFormOpen(true);
  };

  const startEditCategory = (category: Category) => {
    clearFeedback();
    setEditingCategoryId(category.categoryId);
    setCategoryDraft(categoryDraftFrom(category));
    setCategoryFormOpen(true);
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    const key = editingCategoryId === null ? 'category-create' : `category-update-${editingCategoryId}`;
    setActionId(key);
    try {
      const payload: CreateCategoryRequest = {
        name: categoryDraft.name.trim(),
        description: categoryDraft.description.trim() || null,
      };
      if (editingCategoryId === null) await api.createCategory(payload);
      else await api.updateCategory(editingCategoryId, payload);
      setCategoryFormOpen(false);
      setNotice(editingCategoryId === null ? 'Đã tạo danh mục.' : 'Đã cập nhật danh mục.');
      await loadCatalog();
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể lưu danh mục.'));
    } finally {
      setActionId(null);
    }
  };

  const deleteCategory = async (category: Category) => {
    if (!window.confirm(`Xóa danh mục “${category.name}”? Danh mục đang được sản phẩm sử dụng sẽ bị máy chủ từ chối.`)) return;
    clearFeedback();
    setActionId(`category-delete-${category.categoryId}`);
    try {
      await api.deleteCategory(category.categoryId);
      setNotice('Đã xóa danh mục.');
      await loadCatalog();
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể xóa danh mục. Nếu danh mục đang được sản phẩm tham chiếu, hãy chuyển/xóa sản phẩm trước.'));
    } finally {
      setActionId(null);
    }
  };

  const startCreateProduct = () => {
    clearFeedback();
    setEditingProductId(null);
    setProductDraft({ ...emptyProduct, categoryId: categories[0] ? String(categories[0].categoryId) : '' });
    setProductFormOpen(true);
  };

  const startEditProduct = (product: ProductResource) => {
    clearFeedback();
    setEditingProductId(product.productId);
    setProductDraft(productDraftFrom(product));
    setProductFormOpen(true);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    const key = editingProductId === null ? 'product-create' : `product-update-${editingProductId}`;
    setActionId(key);
    try {
      const payload: CreateProductRequest = {
        name: productDraft.name.trim(),
        categoryId: Number(productDraft.categoryId),
        description: productDraft.description.trim() || null,
        brand: productDraft.brand.trim() || null,
        status: productDraft.status,
        images: productDraft.images.map((image, index) => ({
          imageUrl: image.imageUrl.trim(),
          altText: image.altText?.trim() || null,
          sortOrder: Number.isInteger(image.sortOrder) ? image.sortOrder : index,
          isPrimary: image.isPrimary === true,
        })),
      };
      const saved = editingProductId === null
        ? await api.createProduct(payload)
        : await api.updateProduct(editingProductId, payload);
      setSelectedProductId(saved.productId);
      setProductFormOpen(false);
      setNotice(editingProductId === null ? 'Đã tạo sản phẩm. Bạn có thể thêm biến thể bên dưới.' : 'Đã cập nhật sản phẩm.');
      await loadCatalog();
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể lưu sản phẩm.'));
    } finally {
      setActionId(null);
    }
  };

  const deleteProduct = async (product: ProductResource) => {
    if (!window.confirm(`Xóa sản phẩm “${product.name}”? Máy chủ sẽ từ chối nếu sản phẩm còn biến thể hoặc dữ liệu liên quan.`)) return;
    clearFeedback();
    setActionId(`product-delete-${product.productId}`);
    try {
      await api.deleteProduct(product.productId);
      if (selectedProductId === product.productId) setSelectedProductId(null);
      setNotice('Đã xóa sản phẩm.');
      await loadCatalog();
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể xóa sản phẩm. Nếu sản phẩm còn biến thể hoặc được dữ liệu khác tham chiếu, hãy xử lý các mục đó trước.'));
    } finally {
      setActionId(null);
    }
  };

  const changeProductStatus = async (product: ProductResource, status: 'active' | 'inactive') => {
    clearFeedback();
    setActionId(`product-status-${product.productId}`);
    try {
      await api.updateProduct(product.productId, { status });
      setNotice(status === 'active' ? 'Đã bật sản phẩm trên storefront.' : 'Đã ẩn sản phẩm khỏi storefront.');
      await loadCatalog();
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể cập nhật trạng thái sản phẩm.'));
    } finally {
      setActionId(null);
    }
  };

  const startCreateVariant = () => {
    clearFeedback();
    setVariantFormId(null);
    setVariantDraft(emptyVariant);
  };

  const startEditVariant = (variant: ProductVariant) => {
    clearFeedback();
    setVariantFormId(variant.variantId);
    setVariantDraft({ size: variant.size ?? '', color: variant.color ?? '', price: variant.price });
  };

  const saveVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedProductId === null) return;
    const editingVariantId = variantFormId;
    if (editingVariantId === undefined) return;
    clearFeedback();
    const price = Number(variantDraft.price);
    if (!Number.isFinite(price) || price < 0) {
      setActionError('Giá biến thể phải là số không âm.');
      return;
    }
    const key = editingVariantId === null ? 'variant-create' : `variant-update-${editingVariantId}`;
    setActionId(key);
    try {
      const payload = {
        size: variantDraft.size.trim() || null,
        color: variantDraft.color.trim() || null,
        price,
      };
      if (editingVariantId === null) await api.createProductVariant(selectedProductId, payload);
      else await api.updateProductVariant(selectedProductId, editingVariantId, payload);
      await loadVariants(selectedProductId);
      setVariantFormId(undefined);
      setNotice(editingVariantId === null ? 'Đã thêm biến thể.' : 'Đã cập nhật biến thể.');
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể lưu biến thể.'));
    } finally {
      setActionId(null);
    }
  };

  const deleteVariant = async (variant: ProductVariant) => {
    if (selectedProductId === null) return;
    if (!window.confirm(`Xóa biến thể #${variant.variantId}? Nếu biến thể đã được tham chiếu bởi đơn hàng hoặc phiếu nhập, máy chủ sẽ từ chối.`)) return;
    clearFeedback();
    setActionId(`variant-delete-${variant.variantId}`);
    try {
      await api.deleteProductVariant(selectedProductId, variant.variantId);
      await loadVariants(selectedProductId);
      setNotice('Đã xóa biến thể.');
    } catch (error: unknown) {
      setActionError(errorMessage(error, 'Không thể xóa biến thể đang được dữ liệu khác tham chiếu.'));
    } finally {
      setActionId(null);
    }
  };

  const selectedProduct = products.find((product) => product.productId === selectedProductId) ?? null;
  const pageTitle = section === 'categories' ? 'Quản lý danh mục' : 'Quản lý sản phẩm';

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="font-sans text-label-sm font-bold uppercase tracking-[0.14em] text-primary">Danh mục & sản phẩm</p>
          <h2 className="mt-1 font-sans text-headline-md font-bold text-on-surface">{pageTitle}</h2>
          <p className="mt-2 max-w-2xl font-sans text-body-sm text-on-surface-variant">Quản lý dữ liệu danh mục, sản phẩm, biến thể và đường dẫn ảnh đang được API lưu trữ.</p>
        </div>
        <nav aria-label="Mô-đun danh mục và sản phẩm" className="flex gap-2">
          <Link to={`${basePath}/categories`} aria-current={section === 'categories' ? 'page' : undefined} className={`rounded-lg px-4 py-2.5 font-sans text-label-sm font-semibold ${section === 'categories' ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface hover:bg-surface-container-low'}`}>Danh mục</Link>
          <Link to={`${basePath}/products`} aria-current={section === 'products' ? 'page' : undefined} className={`rounded-lg px-4 py-2.5 font-sans text-label-sm font-semibold ${section === 'products' ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface hover:bg-surface-container-low'}`}>Sản phẩm</Link>
        </nav>
      </header>

      {notice && <p role="status" className="rounded-lg border border-success/20 bg-success-soft px-4 py-3 font-sans text-body-sm text-on-surface">{notice}</p>}
      {actionError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive-soft px-4 py-3 font-sans text-body-sm text-destructive">{actionError}</p>}

      {section === 'categories' ? (
        <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-sans text-headline-sm font-bold text-on-surface">Danh sách danh mục</h3>
              <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Danh mục có sản phẩm đang hoạt động sẽ xuất hiện ở storefront.</p>
            </div>
            <button type="button" onClick={startCreateCategory} disabled={actionId !== null} className={primaryButtonClass}><span aria-hidden="true" className="material-symbols-outlined mr-1 text-lg">add</span>Thêm danh mục</button>
          </div>

          {categoryFormOpen && (
            <form onSubmit={(event) => void saveCategory(event)}>
              <fieldset disabled={actionId !== null} className="grid gap-4 rounded-xl border border-primary/20 bg-primary-container/20 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <h4 className="font-sans text-label-md font-bold text-on-surface">{editingCategoryId === null ? 'Tạo danh mục' : `Sửa danh mục #${editingCategoryId}`}</h4>
                <button type="button" onClick={() => setCategoryFormOpen(false)} className="rounded px-2 py-1 font-sans text-label-sm text-on-surface-variant hover:bg-surface">Đóng</button>
              </div>
              <label className={labelClass}>Tên danh mục<input className={fieldClass} value={categoryDraft.name} onChange={(event) => setCategoryDraft((draft) => ({ ...draft, name: event.target.value }))} maxLength={120} required /></label>
              <label className={labelClass}>Mô tả <span className="font-normal text-on-surface-variant">(tùy chọn)</span><input className={fieldClass} value={categoryDraft.description} onChange={(event) => setCategoryDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button type="submit" disabled={actionId !== null} className={primaryButtonClass}>{actionId?.startsWith('category-') ? 'Đang lưu…' : 'Lưu danh mục'}</button>
                <button type="button" onClick={() => setCategoryFormOpen(false)} className={secondaryButtonClass}>Hủy</button>
              </div>
              </fieldset>
            </form>
          )}

          {loading && <p role="status" className="rounded-xl bg-surface-container-low p-6 text-center font-sans text-body-sm text-on-surface-variant">Đang tải danh mục…</p>}
          {!loading && loadError && <div className="rounded-xl bg-destructive-soft p-4"><p role="alert" className="font-sans text-body-sm text-destructive">{loadError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className={`${secondaryButtonClass} mt-3`}>Thử tải lại</button></div>}
          {!loading && !loadError && categories.length === 0 && <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center font-sans text-body-sm text-on-surface-variant">Chưa có danh mục. Tạo danh mục để bắt đầu thêm sản phẩm.</p>}
          {!loading && !loadError && categories.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full min-w-[600px] text-left">
                <thead className="bg-surface-container-low font-sans text-label-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="px-4 py-3">Danh mục</th><th className="px-4 py-3">Mô tả</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead>
                <tbody className="divide-y divide-outline-variant">
                  {categories.map((category) => (
                    <tr key={category.categoryId} className="hover:bg-surface-container-low/70">
                      <td className="px-4 py-3.5"><span className="block font-sans text-label-sm font-semibold text-on-surface">{category.name}</span><span className="font-mono text-xs text-on-surface-variant">#{category.categoryId}</span></td>
                      <td className="max-w-[360px] px-4 py-3.5 font-sans text-body-sm text-on-surface-variant">{category.description || '—'}</td>
                      <td className="px-4 py-3.5"><div className="flex justify-end gap-2"><button type="button" onClick={() => startEditCategory(category)} disabled={actionId !== null} className={secondaryButtonClass}>Sửa</button><button type="button" onClick={() => void deleteCategory(category)} disabled={actionId !== null} className="rounded-lg border border-destructive/30 px-3 py-2 font-sans text-label-sm font-semibold text-destructive hover:bg-destructive-soft disabled:opacity-50">{actionId === `category-delete-${category.categoryId}` ? 'Đang xóa…' : 'Xóa'}</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-sans text-headline-sm font-bold text-on-surface">Danh sách sản phẩm</h3>
                <p className="mt-1 font-sans text-body-xs text-on-surface-variant">Không có theo dõi tồn kho trong MVP. Trạng thái hoạt động quyết định sản phẩm có hiện ở cửa hàng hay không.</p>
              </div>
              <button type="button" onClick={startCreateProduct} disabled={categories.length === 0 || loading || actionId !== null} className={primaryButtonClass}><span aria-hidden="true" className="material-symbols-outlined mr-1 text-lg">add</span>Thêm sản phẩm</button>
            </div>
            <label className={labelClass}>Tìm sản phẩm<input className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, nhãn hiệu, danh mục hoặc mã sản phẩm" /></label>

            {productFormOpen && (
              <form onSubmit={(event) => void saveProduct(event)}>
                <fieldset disabled={actionId !== null} className="space-y-4 rounded-xl border border-primary/20 bg-primary-container/20 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h4 className="font-sans text-label-md font-bold text-on-surface">{editingProductId === null ? 'Tạo sản phẩm' : `Sửa sản phẩm #${editingProductId}`}</h4><p className="mt-1 font-sans text-body-xs text-on-surface-variant">Ảnh dùng URL HTTPS; hệ thống không tải tệp lên.</p></div>
                  <button type="button" onClick={() => setProductFormOpen(false)} className="rounded px-2 py-1 font-sans text-label-sm text-on-surface-variant hover:bg-surface">Đóng</button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>Tên sản phẩm<input className={fieldClass} value={productDraft.name} onChange={(event) => setProductDraft((draft) => ({ ...draft, name: event.target.value }))} maxLength={200} required /></label>
                  <label className={labelClass}>Danh mục<select className={fieldClass} value={productDraft.categoryId} onChange={(event) => setProductDraft((draft) => ({ ...draft, categoryId: event.target.value }))} required><option value="" disabled>Chọn danh mục</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.name}</option>)}</select></label>
                  <label className={labelClass}>Thương hiệu<input className={fieldClass} value={productDraft.brand} onChange={(event) => setProductDraft((draft) => ({ ...draft, brand: event.target.value }))} maxLength={120} /></label>
                  <label className={labelClass}>Trạng thái<select className={fieldClass} value={productDraft.status} onChange={(event) => setProductDraft((draft) => ({ ...draft, status: event.target.value }))}><option value="active">Đang hoạt động</option><option value="inactive">Đã ẩn</option>{!['active', 'inactive'].includes(productDraft.status) && <option value={productDraft.status}>Trạng thái hiện tại: {productDraft.status}</option>}</select></label>
                  <label className={`${labelClass} sm:col-span-2`}>Mô tả<textarea className={fieldClass} rows={3} value={productDraft.description} onChange={(event) => setProductDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
                </div>

                <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h5 className="font-sans text-label-sm font-bold text-on-surface">Ảnh sản phẩm ({productDraft.images.length}/12)</h5><p className="mt-1 font-sans text-body-xs text-on-surface-variant">Nếu không chọn ảnh chính, máy chủ chọn ảnh có thứ tự hiển thị thấp nhất.</p></div><button type="button" disabled={productDraft.images.length >= 12} onClick={() => setProductDraft((draft) => ({ ...draft, images: [...draft.images, { imageUrl: '', altText: '', sortOrder: draft.images.length, isPrimary: draft.images.length === 0 }] }))} className={secondaryButtonClass}>Thêm URL ảnh</button></div>
                  {productDraft.images.length === 0 && <p className="text-sm text-on-surface-variant">Chưa thêm ảnh.</p>}
                  {productDraft.images.map((image, index) => (
                    <div key={`image-${index}`} className="grid gap-3 rounded-lg bg-surface-container-low p-3 sm:grid-cols-12">
                      <label className={`${labelClass} sm:col-span-6`}>URL HTTPS *<input className={fieldClass} type="url" pattern="https://.*" value={image.imageUrl} onChange={(event) => setProductDraft((draft) => ({ ...draft, images: draft.images.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: event.target.value } : item) }))} placeholder="https://example.com/image.jpg" required /></label>
                      <label className={`${labelClass} sm:col-span-3`}>Alt text<input className={fieldClass} value={image.altText ?? ''} maxLength={200} onChange={(event) => setProductDraft((draft) => ({ ...draft, images: draft.images.map((item, itemIndex) => itemIndex === index ? { ...item, altText: event.target.value } : item) }))} /></label>
                      <label className={`${labelClass} sm:col-span-2`}>Thứ tự<input className={fieldClass} type="number" min={0} step={1} value={image.sortOrder ?? index} onChange={(event) => setProductDraft((draft) => ({ ...draft, images: draft.images.map((item, itemIndex) => itemIndex === index ? { ...item, sortOrder: event.target.value === '' ? index : Number(event.target.value) } : item) }))} /></label>
                      <div className="flex items-end justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-center sm:justify-center">
                        <label className="flex items-center gap-2 font-sans text-body-xs text-on-surface"><input type="radio" name="primary-product-image" checked={image.isPrimary === true} onChange={() => setProductDraft((draft) => ({ ...draft, images: draft.images.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })) }))} />Chính</label>
                        <button type="button" aria-label={`Xóa ảnh thứ ${index + 1}`} onClick={() => setProductDraft((draft) => ({ ...draft, images: draft.images.filter((_item, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sortOrder: item.sortOrder ?? itemIndex })) }))} className="rounded p-1 font-sans text-label-xs font-semibold text-destructive hover:bg-destructive-soft">Xóa</button>
                      </div>
                    </div>
                  ))}
                </section>
                <div className="flex flex-wrap gap-2"><button type="submit" disabled={actionId !== null} className={primaryButtonClass}>{actionId?.startsWith('product-') ? 'Đang lưu…' : 'Lưu sản phẩm'}</button><button type="button" onClick={() => setProductFormOpen(false)} className={secondaryButtonClass}>Hủy</button></div>
                </fieldset>
              </form>
            )}

            {loading && <p role="status" className="rounded-xl bg-surface-container-low p-6 text-center font-sans text-body-sm text-on-surface-variant">Đang tải sản phẩm…</p>}
            {!loading && loadError && <div className="rounded-xl bg-destructive-soft p-4"><p role="alert" className="font-sans text-body-sm text-destructive">{loadError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className={`${secondaryButtonClass} mt-3`}>Thử tải lại</button></div>}
            {!loading && !loadError && products.length === 0 && <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center font-sans text-body-sm text-on-surface-variant">Chưa có sản phẩm. Tạo sản phẩm rồi thêm biến thể và giá bán.</p>}
            {!loading && !loadError && products.length > 0 && visibleProducts.length === 0 && <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center font-sans text-body-sm text-on-surface-variant">Không tìm thấy sản phẩm phù hợp.</p>}
            {!loading && !loadError && visibleProducts.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-outline-variant">
                <table className="w-full min-w-[860px] text-left">
                  <thead className="bg-surface-container-low font-sans text-label-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="px-4 py-3">Sản phẩm</th><th className="px-4 py-3">Danh mục</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead>
                  <tbody className="divide-y divide-outline-variant">
                    {visibleProducts.map((product) => {
                      const categoryName = product.category?.name ?? categories.find((category) => category.categoryId === product.categoryId)?.name ?? `Danh mục #${product.categoryId}`;
                      const primaryImage = product.images?.find((image) => image.isPrimary) ?? product.images?.[0];
                      const active = product.status === 'active';
                      return (
                        <tr key={product.productId} className={selectedProductId === product.productId ? 'bg-primary-container/20' : 'hover:bg-surface-container-low/70'}>
                          <td className="px-4 py-3.5"><div className="flex items-center gap-3">{primaryImage ? <img src={primaryImage.imageUrl} alt={primaryImage.altText || product.name} className="h-14 w-12 rounded-lg border border-outline-variant object-cover" loading="lazy" /> : <div aria-hidden="true" className="flex h-14 w-12 items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant"><span className="material-symbols-outlined">image</span></div>}<div className="min-w-0"><span className="block max-w-[300px] truncate font-sans text-label-sm font-semibold text-on-surface">{product.name}</span><span className="mt-1 block font-sans text-body-xs text-on-surface-variant">#{product.productId}{product.brand ? ` · ${product.brand}` : ''}</span><span className="mt-1 block font-sans text-body-xs text-on-surface-variant">{product.images?.length ?? 0} ảnh</span></div></div></td>
                          <td className="px-4 py-3.5 font-sans text-body-sm text-on-surface">{categoryName}</td>
                          <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-success-soft text-success' : 'bg-surface-container-high text-on-surface-variant'}`}>{active ? 'Đang hoạt động' : product.status === 'inactive' ? 'Đã ẩn' : `Trạng thái: ${product.status}`}</span></td>
                          <td className="px-4 py-3.5"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setSelectedProductId(product.productId); setVariantFormId(undefined); }} disabled={actionId !== null} className={secondaryButtonClass}>{selectedProductId === product.productId ? 'Đang mở biến thể' : 'Biến thể'}</button><button type="button" onClick={() => startEditProduct(product)} disabled={actionId !== null} className={secondaryButtonClass}>Sửa</button><button type="button" onClick={() => void changeProductStatus(product, active ? 'inactive' : 'active')} disabled={actionId !== null} className="rounded-lg border border-outline-variant px-3 py-2 font-sans text-label-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-50">{active ? 'Ẩn' : 'Kích hoạt'}</button><button type="button" onClick={() => void deleteProduct(product)} disabled={actionId !== null} className="rounded-lg border border-destructive/30 px-3 py-2 font-sans text-label-sm font-semibold text-destructive hover:bg-destructive-soft disabled:opacity-50">Xóa</button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {categories.length === 0 && !loading && !loadError && <p className="rounded-lg border border-warning/30 bg-warning-soft p-4 font-sans text-body-sm text-on-surface">Cần tạo danh mục trước khi thêm sản phẩm. <Link to={`${basePath}/categories`} className="font-semibold text-primary underline">Mở quản lý danh mục</Link>.</p>}

          {selectedProduct && (
            <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-sans text-label-xs font-bold uppercase tracking-wide text-primary">Biến thể sản phẩm</p><h3 className="mt-1 font-sans text-headline-sm font-bold text-on-surface">{selectedProduct.name}</h3><p className="mt-1 font-sans text-body-xs text-on-surface-variant">Quản lý size, màu sắc và giá; hệ thống không lưu số lượng tồn.</p></div>
                <button type="button" onClick={startCreateVariant} disabled={actionId !== null} className={primaryButtonClass}><span aria-hidden="true" className="material-symbols-outlined mr-1 text-lg">add</span>Thêm biến thể</button>
              </div>

              {variantFormId !== undefined && (
                <form onSubmit={(event) => void saveVariant(event)}>
                  <fieldset disabled={actionId !== null} className="grid gap-4 rounded-xl border border-primary/20 bg-primary-container/20 p-4 sm:grid-cols-4">
                  <label className={labelClass}>Size <span className="font-normal text-on-surface-variant">(tùy chọn)</span><input className={fieldClass} value={variantDraft.size} onChange={(event) => setVariantDraft((draft) => ({ ...draft, size: event.target.value }))} maxLength={50} placeholder="S, M, L, XL" /></label>
                  <label className={labelClass}>Màu <span className="font-normal text-on-surface-variant">(tùy chọn)</span><input className={fieldClass} value={variantDraft.color} onChange={(event) => setVariantDraft((draft) => ({ ...draft, color: event.target.value }))} maxLength={50} placeholder="Đen, trắng…" /></label>
                  <label className={labelClass}>Giá (VND)<input className={fieldClass} type="number" value={variantDraft.price} onChange={(event) => setVariantDraft((draft) => ({ ...draft, price: event.target.value }))} min={0} max={9999999999.99} step="0.01" required /></label>
                  <div className="flex items-end gap-2"><button type="submit" disabled={actionId !== null} className={primaryButtonClass}>{actionId?.startsWith('variant-') ? 'Đang lưu…' : 'Lưu'}</button><button type="button" onClick={() => setVariantFormId(undefined)} className={secondaryButtonClass}>Hủy</button></div>
                  </fieldset>
                </form>
              )}

              {variantsLoading && <p role="status" className="rounded-xl bg-surface-container-low p-5 text-center font-sans text-body-sm text-on-surface-variant">Đang tải biến thể…</p>}
              {!variantsLoading && variantsError && <div className="rounded-xl bg-destructive-soft p-4"><p role="alert" className="font-sans text-body-sm text-destructive">{variantsError}</p><button type="button" onClick={() => void loadVariants(selectedProduct.productId)} className={`${secondaryButtonClass} mt-3`}>Thử tải lại</button></div>}
              {!variantsLoading && !variantsError && variants.length === 0 && <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center font-sans text-body-sm text-on-surface-variant">Sản phẩm chưa có biến thể. Thêm ít nhất một biến thể để sản phẩm có giá hiển thị trên storefront.</p>}
              {!variantsLoading && !variantsError && variants.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-outline-variant">
                  <table className="w-full min-w-[540px] text-left"><thead className="bg-surface-container-low font-sans text-label-xs uppercase tracking-wide text-on-surface-variant"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Màu</th><th className="px-4 py-3 text-right">Giá bán</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-outline-variant">{variants.map((variant) => <tr key={variant.variantId} className="hover:bg-surface-container-low/70"><td className="px-4 py-3 font-mono text-xs text-on-surface-variant">#{variant.variantId}</td><td className="px-4 py-3 font-sans text-body-sm text-on-surface">{variant.size || '—'}</td><td className="px-4 py-3 font-sans text-body-sm text-on-surface">{variant.color || '—'}</td><td className="px-4 py-3 text-right font-sans text-label-sm font-semibold text-on-surface">{formatPrice(variant.price)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => startEditVariant(variant)} disabled={actionId !== null} className={secondaryButtonClass}>Sửa</button><button type="button" onClick={() => void deleteVariant(variant)} disabled={actionId !== null} className="rounded-lg border border-destructive/30 px-3 py-2 font-sans text-label-sm font-semibold text-destructive hover:bg-destructive-soft disabled:opacity-50">Xóa</button></div></td></tr>)}</tbody></table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
