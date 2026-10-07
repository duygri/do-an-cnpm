import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProductCard } from '../src/components/storefront/ProductCard';
import type { StoreProductSummary } from '../src/types';

const product: StoreProductSummary = {
  productId: 42,
  name: 'Áo thun cotton',
  description: 'Áo mặc hằng ngày',
  brand: 'Indigo',
  category: { categoryId: 3, name: 'Áo' },
  priceFrom: '250000',
  primaryImageUrl: null,
};

describe('ProductCard', () => {
  it('exposes the product card as one accessible link to its detail page', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProductCard product={product} />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('aria-label')).toBe('Xem chi tiết Áo thun cotton');
    expect(links[0].getAttribute('href')).toBe('/product/42');
    expect(links[0].textContent).toContain('Xem chi tiết');
  });
});
