import React from 'react';
import { Link } from 'react-router-dom';
import { StoreProductSummary } from '../../types';

interface ProductCardProps {
  product: StoreProductSummary;
}

function formatPrice(value: string | null): string {
  if (value === null || !Number.isFinite(Number(value))) return 'Chưa có giá';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => (
  <Link
    to={`/product/${product.productId}`}
    aria-label={`Xem chi tiết ${product.name}`}
    className="group flex flex-col overflow-hidden rounded-2xl bg-surface shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
  >
    <div className="relative block aspect-[4/5] w-full overflow-hidden bg-surface-container-high">
      {product.primaryImageUrl ? (
        <img
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          src={product.primaryImageUrl}
          alt={product.name}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-on-surface-variant" aria-label="Chưa có ảnh sản phẩm">
          <span className="material-symbols-outlined text-5xl">image</span>
          <span className="font-sans text-body-sm">Chưa có ảnh</span>
        </div>
      )}
    </div>

    <div className="flex flex-1 flex-col gap-2 p-4">
      <span className="font-sans text-label-sm font-semibold uppercase tracking-wider text-outline">
        {product.category.name}
      </span>
      {product.brand && (
        <span className="font-sans text-label-sm font-medium text-on-surface-variant">{product.brand}</span>
      )}
      <h3 className="line-clamp-2 font-sans text-headline-sm font-semibold text-on-surface transition-colors group-hover:text-primary">
        {product.name}
      </h3>
      {product.description && (
        <p className="line-clamp-2 font-sans text-body-sm text-on-surface-variant">{product.description}</p>
      )}

      <div className="mt-auto flex items-baseline gap-2 pt-2">
        <span className="font-sans text-label-sm text-outline">Giá từ</span>
        <span className="font-sans text-price-display font-bold text-primary">
          {formatPrice(product.priceFrom)}
        </span>
      </div>

      <span
        className="mt-2 block w-full rounded-lg bg-surface-container py-2.5 text-center font-sans text-label-md font-medium text-on-surface transition-colors group-hover:bg-primary group-hover:text-on-primary"
      >
        Xem chi tiết
      </span>
    </div>
  </Link>
);
