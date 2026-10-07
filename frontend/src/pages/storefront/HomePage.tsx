import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Category, StoreProductSummary } from '../../types';
import { ProductCard } from '../../components/storefront/ProductCard';

const PAGE_SIZE = 12;

interface ProductFilters {
  categoryId?: number;
  page: number;
  query: string;
}

export const HomePage: React.FC<{ searchQuery?: string }> = ({ searchQuery }) => {
  const normalizedQuery = searchQuery?.trim() ?? '';
  const [products, setProducts] = useState<StoreProductSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoriesRetry, setCategoriesRetry] = useState(0);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsRetry, setProductsRetry] = useState(0);
  const [filters, setFilters] = useState<ProductFilters>({ page: 1, query: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0 });

  // A new search always starts at the first server page.
  const page = filters.query === normalizedQuery ? filters.page : 1;

  useEffect(() => {
    let current = true;
    setCategoriesLoading(true);
    setCategoriesError(null);

    api.getCategories()
      .then((result) => {
        if (current) setCategories(result);
      })
      .catch((error: unknown) => {
        if (current) {
          setCategoriesError(error instanceof Error ? error.message : 'Không thể tải danh mục.');
        }
      })
      .finally(() => {
        if (current) setCategoriesLoading(false);
      });

    return () => { current = false; };
  }, [categoriesRetry]);

  useEffect(() => {
    let current = true;
    setProductsLoading(true);
    setProductsError(null);

    api.getStoreProducts({
      page,
      limit: PAGE_SIZE,
      q: normalizedQuery || undefined,
      categoryId: filters.categoryId,
    })
      .then((result) => {
        if (!current) return;
        setProducts(result.items);
        setPagination({ page: result.page, limit: result.limit, total: result.total });
        setFilters((previous) => ({ ...previous, page: result.page, query: normalizedQuery }));
      })
      .catch((error: unknown) => {
        if (current) {
          setProductsError(error instanceof Error ? error.message : 'Không thể tải sản phẩm.');
        }
      })
      .finally(() => {
        if (current) setProductsLoading(false);
      });

    return () => { current = false; };
  }, [filters.categoryId, normalizedQuery, page, productsRetry]);

  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const selectCategory = (categoryId?: number) => {
    setFilters({ categoryId, page: 1, query: normalizedQuery });
  };

  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-gutter pb-space-xl">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-container via-surface-container-low to-secondary-container p-7 shadow-sm sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-secondary/10 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="flex flex-col items-start gap-5 lg:col-span-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 font-sans text-label-md text-primary">
                <span className="material-symbols-outlined text-base">checkroom</span>
                Thời trang và phong cách của bạn
              </span>
              <h1 className="font-sans text-headline-xl leading-tight tracking-tight text-on-surface">
                Khám phá những thiết kế phù hợp với bạn
              </h1>
              <p className="max-w-2xl font-sans text-body-lg leading-relaxed text-on-surface-variant">
                Xem danh mục và sản phẩm đang được cửa hàng giới thiệu.
              </p>
              <a
                className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-primary px-6 py-3.5 font-sans text-label-lg text-on-primary shadow-md transition-colors hover:bg-primary-hover"
                href="#catalog-grid"
              >
                Khám phá sản phẩm
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </a>
            </div>
            <div className="hidden items-center justify-center lg:col-span-4 lg:flex">
              <div className="flex aspect-square w-full max-w-xs items-center justify-center rounded-full bg-surface/70 text-primary shadow-inner">
                <span className="material-symbols-outlined text-[9rem]">apparel</span>
              </div>
            </div>
          </div>
        </section>

        <section id="catalog-grid" className="flex scroll-mt-24 flex-col gap-6 pt-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                <span className="font-sans text-label-sm uppercase tracking-wider text-outline">
                  Danh mục cửa hàng
                </span>
              </div>
              <h2 className="font-sans text-headline-lg font-bold tracking-tight text-on-surface">
                Sản phẩm
              </h2>
            </div>
            {!productsLoading && !productsError && (
              <span className="font-sans text-body-sm text-on-surface-variant">
                {pagination.total} sản phẩm
              </span>
            )}
          </div>

          {categoriesError && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl bg-destructive-soft p-4 text-destructive sm:flex-row sm:items-center sm:justify-between">
              <span>Không thể tải danh mục: {categoriesError}</span>
              <button
                type="button"
                onClick={() => setCategoriesRetry((value) => value + 1)}
                className="rounded-lg bg-surface px-4 py-2 font-sans text-label-md text-on-surface"
              >
                Thử lại
              </button>
            </div>
          )}

          {!categoriesError && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none" aria-label="Lọc theo danh mục">
              <button
                type="button"
                onClick={() => selectCategory(undefined)}
                aria-pressed={filters.categoryId === undefined}
                className={`shrink-0 rounded-full px-4 py-2 font-sans text-label-md shadow-sm transition-colors ${filters.categoryId === undefined ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}
              >
                Tất cả
              </button>
              {categories.map((category) => (
                <button
                  key={category.categoryId}
                  type="button"
                  onClick={() => selectCategory(category.categoryId)}
                  aria-pressed={filters.categoryId === category.categoryId}
                  className={`shrink-0 rounded-full px-4 py-2 font-sans text-label-md shadow-sm transition-colors ${filters.categoryId === category.categoryId ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}
                >
                  {category.name}
                </button>
              ))}
              {categoriesLoading && <span className="font-sans text-body-sm text-outline">Đang tải danh mục…</span>}
            </div>
          )}

          {productsLoading ? (
            <div role="status" className="rounded-2xl bg-surface p-12 text-center font-sans text-body-md text-on-surface-variant">
              Đang tải sản phẩm…
            </div>
          ) : productsError ? (
            <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-10 text-center shadow-sm">
              <span className="material-symbols-outlined text-4xl text-destructive">cloud_off</span>
              <div>
                <h3 className="font-sans text-headline-sm font-semibold text-on-surface">Chưa tải được sản phẩm</h3>
                <p className="mt-1 max-w-xl font-sans text-body-sm text-on-surface-variant">{productsError}</p>
              </div>
              <button
                type="button"
                onClick={() => setProductsRetry((value) => value + 1)}
                className="rounded-lg bg-primary px-5 py-2.5 font-sans text-label-md text-on-primary hover:bg-primary-hover"
              >
                Thử tải lại
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl bg-surface p-12 text-center shadow-sm">
              <span className="material-symbols-outlined text-4xl text-outline">search_off</span>
              <h3 className="mt-3 font-sans text-headline-sm font-semibold text-on-surface">Không tìm thấy sản phẩm</h3>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                Thử đổi từ khóa tìm kiếm hoặc chọn danh mục khác.
              </p>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {products.map((product) => <ProductCard key={product.productId} product={product} />)}
              </section>

              <div className="flex flex-col items-center justify-between gap-4 pt-2 sm:flex-row">
                <span className="font-sans text-body-sm text-on-surface-variant">
                  Trang {pagination.page} / {pageCount} · {pagination.total} sản phẩm
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1 || productsLoading}
                    onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, pagination.page - 1), query: normalizedQuery }))}
                    className="inline-flex items-center gap-1 rounded-lg bg-surface px-4 py-2.5 font-sans text-label-md text-on-surface shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pageCount || productsLoading}
                    onClick={() => setFilters((current) => ({ ...current, page: Math.min(pageCount, pagination.page + 1), query: normalizedQuery }))}
                    className="inline-flex items-center gap-1 rounded-lg bg-surface px-4 py-2.5 font-sans text-label-md text-on-surface shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sau
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
