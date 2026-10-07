import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { HttpError } from '../../services/http';
import { api } from '../../services/api';
import { StoreProductDetail } from '../../types';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

function formatPrice(value?: string | null): string {
  if (value == null || !Number.isFinite(Number(value))) return 'Chưa có giá';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [product, setProduct] = useState<StoreProductDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  const productId = id && /^\d+$/.test(id) ? Number(id) : NaN;

  useEffect(() => {
    let current = true;
    setProduct(null);
    setError(null);
    setSelectedImageIndex(0);
    setSelectedVariantId(null);
    setQuantity(1);
    setAddedToCart(false);

    if (!Number.isSafeInteger(productId) || productId < 1) {
      setLoadState('not-found');
      return () => { current = false; };
    }

    setLoadState('loading');
    api.getStoreProduct(productId)
      .then((result) => {
        if (!current) return;
        setProduct(result);
        const primaryIndex = result.images.findIndex((image) => image.isPrimary);
        setSelectedImageIndex(primaryIndex >= 0 ? primaryIndex : 0);
        setSelectedVariantId(result.variants[0]?.variantId ?? null);
        setLoadState('loaded');
      })
      .catch((reason: unknown) => {
        if (!current) return;
        if (reason instanceof HttpError && reason.status === 404) {
          setLoadState('not-found');
          return;
        }
        setError(reason instanceof Error ? reason.message : 'Không thể tải thông tin sản phẩm.');
        setLoadState('error');
      });

    return () => { current = false; };
  }, [productId, retry]);

  const selectedVariant = product?.variants.find((variant) => variant.variantId === selectedVariantId)
    ?? product?.variants[0]
    ?? null;
  const selectedImage = product?.images[selectedImageIndex] ?? null;

  const addSelectedVariant = () => {
    if (!product || !selectedVariant) return;
    addToCart({
      productId: product.productId,
      variantId: selectedVariant.variantId,
      name: product.name,
      size: selectedVariant.size,
      color: selectedVariant.color,
      price: selectedVariant.price,
      imageUrl: product.images.find((image) => image.isPrimary)?.imageUrl
        ?? selectedImage?.imageUrl
        ?? undefined,
    }, quantity);
    setAddedToCart(true);
  };

  if (loadState === 'loading') {
    return (
      <div className="mx-auto w-full max-w-7xl px-gutter py-16">
        <div role="status" className="rounded-2xl bg-surface p-12 text-center font-sans text-body-md text-on-surface-variant shadow-sm">
          Đang tải thông tin sản phẩm…
        </div>
      </div>
    );
  }

  if (loadState === 'not-found') {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-gutter py-20 text-center">
        <span className="material-symbols-outlined text-5xl text-outline">inventory_2</span>
        <h1 className="mt-4 font-sans text-headline-lg font-bold text-on-surface">Không tìm thấy sản phẩm</h1>
        <p className="mt-2 font-sans text-body-md text-on-surface-variant">Sản phẩm có thể không còn được hiển thị.</p>
        <Link to="/#catalog-grid" className="mt-6 rounded-lg bg-primary px-5 py-3 font-sans text-label-md text-on-primary hover:bg-primary-hover">
          Quay lại danh sách sản phẩm
        </Link>
      </div>
    );
  }

  if (loadState === 'error' || !product || product.productId !== productId) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-gutter py-20 text-center">
        <span className="material-symbols-outlined text-5xl text-destructive">cloud_off</span>
        <h1 className="mt-4 font-sans text-headline-lg font-bold text-on-surface">Chưa tải được sản phẩm</h1>
        <p role="alert" className="mt-2 max-w-2xl font-sans text-body-md text-on-surface-variant">
          {error ?? 'Đã xảy ra lỗi khi tải thông tin sản phẩm.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded-lg bg-primary px-5 py-3 font-sans text-label-md text-on-primary hover:bg-primary-hover">
            Thử tải lại
          </button>
          <Link to="/#catalog-grid" className="rounded-lg bg-surface px-5 py-3 font-sans text-label-md text-on-surface shadow-sm">
            Về danh sách
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-space-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-gutter">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 pt-5 font-sans text-label-md text-on-surface-variant">
          <Link to="/" className="inline-flex items-center gap-1 hover:text-primary">
            <span className="material-symbols-outlined text-base">home</span>
            Trang chủ
          </Link>
          <span className="material-symbols-outlined text-base">chevron_right</span>
          <Link to="/#catalog-grid" className="hover:text-primary">{product.category.name}</Link>
          <span className="material-symbols-outlined text-base">chevron_right</span>
          <span className="truncate text-on-surface">{product.name}</span>
        </nav>

        <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-3">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-surface-container-high shadow-sm">
              {selectedImage ? (
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.altText || product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-on-surface-variant">
                  <span className="material-symbols-outlined text-6xl">image</span>
                  <span className="font-sans text-body-md">Sản phẩm chưa có ảnh</span>
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-5 gap-3" aria-label="Ảnh sản phẩm">
                {product.images.map((image, index) => (
                  <button
                    key={image.productImageId}
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    aria-label={`Xem ảnh ${index + 1} của ${product.name}`}
                    aria-pressed={selectedImageIndex === index}
                    className={`aspect-square overflow-hidden rounded-lg bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selectedImageIndex === index ? 'ring-2 ring-primary ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
                  >
                    <img src={image.imageUrl} alt={image.altText || `${product.name} - ảnh ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="font-sans text-label-sm font-semibold uppercase tracking-wider text-outline">
                {product.category.name}
              </span>
              {product.brand && <span className="font-sans text-label-md text-on-surface-variant">{product.brand}</span>}
              <h1 className="font-sans text-headline-xl font-bold leading-tight tracking-tight text-on-surface">{product.name}</h1>
            </div>

            <div className="rounded-xl bg-surface p-space-md shadow-sm">
              <span className="font-sans text-body-sm text-on-surface-variant">
                {selectedVariant ? 'Giá của biến thể đã chọn' : 'Giá'}
              </span>
              <p className="mt-1 font-sans text-headline-xl font-bold tracking-tight text-primary">
                {formatPrice(selectedVariant?.price)}
              </p>
            </div>

            <div className="space-y-3 rounded-xl bg-surface p-space-md shadow-sm">
              <div>
                <h2 className="font-sans text-label-lg font-semibold text-on-surface">Biến thể</h2>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Chọn đúng size và màu trước khi thêm sản phẩm vào giỏ.</p>
              </div>
              {product.variants.length === 0 ? (
                <p className="rounded-lg bg-surface-container-low p-4 font-sans text-body-sm text-on-surface-variant">
                  Sản phẩm hiện chưa có biến thể để đặt hàng.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {product.variants.map((variant) => {
                    const isSelected = selectedVariant?.variantId === variant.variantId;
                    const attributes = [variant.color, variant.size].filter((value): value is string => Boolean(value));
                    const label = attributes.length > 0 ? attributes.join(' · ') : 'Không phân loại';
                    return (
                      <button
                        key={variant.variantId}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.variantId)}
                        aria-pressed={isSelected}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary-soft' : 'border-outline-variant bg-surface hover:bg-surface-container-low'}`}
                      >
                        <span className="font-sans text-label-md font-semibold text-on-surface">{label}</span>
                        <span className="shrink-0 font-sans text-label-sm font-semibold text-primary">{formatPrice(variant.price)}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedVariant && (
                <div className="flex items-center justify-between border-t border-outline-variant pt-4">
                  <span className="font-sans text-label-md font-semibold text-on-surface">Số lượng</span>
                  <div className="flex items-center gap-1 rounded-lg bg-surface-container-low p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      disabled={quantity <= 1}
                      aria-label="Giảm số lượng"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-on-surface shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-lg">remove</span>
                    </button>
                    <span aria-live="polite" className="w-10 text-center font-sans text-label-lg font-bold text-on-surface">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => value + 1)}
                      aria-label="Tăng số lượng"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-on-surface shadow-sm"
                    >
                      <span className="material-symbols-outlined text-lg">add</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={addSelectedVariant}
                disabled={!selectedVariant}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 font-sans text-label-lg font-semibold text-on-primary shadow-md transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined">shopping_bag</span>
                Thêm vào giỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  addSelectedVariant();
                  if (selectedVariant) navigate('/cart');
                }}
                disabled={!selectedVariant}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-on-surface px-5 py-3.5 font-sans text-label-lg font-semibold text-surface transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mua ngay
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>

            {addedToCart && (
              <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-success p-3 font-sans text-body-sm text-on-primary">
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  Đã thêm {product.name} vào giỏ hàng.
                </span>
                <Link to="/cart" className="shrink-0 font-semibold underline">Xem giỏ</Link>
              </div>
            )}

            <section className="rounded-xl bg-surface p-space-md shadow-sm">
              <h2 className="font-sans text-label-lg font-semibold text-on-surface">Mô tả sản phẩm</h2>
              <p className="mt-2 whitespace-pre-line font-sans text-body-md leading-relaxed text-on-surface-variant">
                {product.description || 'Chưa có mô tả cho sản phẩm này.'}
              </p>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};
