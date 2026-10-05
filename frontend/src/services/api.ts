import {
  AdminOrder,
  AdminOrderSummary,
  Category,
  CreateCategoryRequest,
  CreateOrderRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  CustomerAuthResponse,
  CustomerOrder,
  CustomerOrderSummary,
  CustomerProfile,
  EmployeeAuthResponse,
  EmployeeProfile,
  EmployeeRecord,
  EmployeeRole,
  EmployeeStatus,
  InvoiceSummary,
  ImportRecord,
  OrderStatus,
  PaginatedResult,
  PaginationParams,
  ProductResource,
  ProductVariant,
  Promotion,
  StoreProductDetail,
  StoreProductSummary,
  Supplier,
  UpdateCategoryRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
  Voucher,
} from '../types';
import { request } from './http';

type EmployeeOptions = { tokenOwner: 'employee' };
type CustomerOptions = { tokenOwner: 'customer' };

function withQuery<T extends object>(path: string, values: T): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function createIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('PayOS checkout requires a secure random Idempotency-Key.');
}

export interface StoreProductQuery extends PaginationParams {
  q?: string;
  categoryId?: number;
}

export interface AdminOrderQuery extends PaginationParams {
  status?: OrderStatus;
}

export interface CreateImportDetailRequest {
  variantId: number;
  quantity: number;
  unitPrice: string;
}

export interface CreateImportRequest {
  supplierId: number;
  note?: string | null;
  details: CreateImportDetailRequest[];
}

export const api = {
  // Customer authentication
  customerLogin(email: string, password: string): Promise<CustomerAuthResponse> {
    return request('/auth/customer/login', {
      method: 'POST',
      body: { email, password },
    });
  },

  customerRegister(data: {
    name: string;
    email: string;
    password: string;
    dateOfBirth?: string | null;
    phone?: string | null;
    address?: string | null;
    gender?: string | null;
  }): Promise<CustomerAuthResponse> {
    return request('/auth/customer/register', { method: 'POST', body: data });
  },

  getCustomerProfile(): Promise<CustomerProfile> {
    return request('/auth/customer/profile', { tokenOwner: 'customer', allowUnverifiedSession: true });
  },

  updateCustomerProfile(data: {
    name?: string;
    dateOfBirth?: string | null;
    phone?: string | null;
    address?: string | null;
    gender?: string | null;
  }): Promise<CustomerProfile> {
    return request('/auth/customer/profile', {
      method: 'PATCH',
      tokenOwner: 'customer',
      body: data,
    });
  },

  // Employee authentication
  employeeLogin(email: string, password: string): Promise<EmployeeAuthResponse> {
    return request('/auth/employee/login', {
      method: 'POST',
      body: { email, password },
    });
  },

  getEmployeeProfile(): Promise<EmployeeProfile> {
    return request('/auth/employee/profile', { tokenOwner: 'employee', allowUnverifiedSession: true });
  },

  // Public storefront
  getCategories(): Promise<Category[]> {
    return request('/store/categories');
  },

  getStoreProducts(params: StoreProductQuery = {}): Promise<PaginatedResult<StoreProductSummary>> {
    return request(withQuery('/store/products', params));
  },

  getStoreProduct(productId: number): Promise<StoreProductDetail> {
    return request(`/store/products/${productId}`);
  },

  // Employee catalog management
  getManagedCategories(): Promise<Category[]> {
    return request('/categories', { tokenOwner: 'employee' });
  },

  getCategory(categoryId: number): Promise<Category> {
    return request(`/categories/${categoryId}`, { tokenOwner: 'employee' });
  },

  createCategory(data: CreateCategoryRequest): Promise<Category> {
    return request('/categories', { method: 'POST', tokenOwner: 'employee', body: data });
  },

  updateCategory(
    categoryId: number,
    data: UpdateCategoryRequest,
  ): Promise<Category> {
    return request(`/categories/${categoryId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  deleteCategory(categoryId: number): Promise<void> {
    return request(`/categories/${categoryId}`, { method: 'DELETE', tokenOwner: 'employee' });
  },

  getCatalogProducts(): Promise<ProductResource[]> {
    return request('/products', { tokenOwner: 'employee' });
  },

  getCatalogProduct(productId: number): Promise<ProductResource> {
    return request(`/products/${productId}`, { tokenOwner: 'employee' });
  },

  createProduct(data: CreateProductRequest): Promise<ProductResource> {
    return request('/products', { method: 'POST', tokenOwner: 'employee', body: data });
  },

  updateProduct(
    productId: number,
    data: UpdateProductRequest,
  ): Promise<ProductResource> {
    return request(`/products/${productId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  deleteProduct(productId: number): Promise<void> {
    return request(`/products/${productId}`, { method: 'DELETE', tokenOwner: 'employee' });
  },

  getProductVariants(productId: number): Promise<ProductVariant[]> {
    return request(`/products/${productId}/variants`, { tokenOwner: 'employee' });
  },

  createProductVariant(
    productId: number,
    data: CreateProductVariantRequest,
  ): Promise<ProductVariant> {
    return request(`/products/${productId}/variants`, {
      method: 'POST',
      tokenOwner: 'employee',
      body: data,
    });
  },

  updateProductVariant(
    productId: number,
    variantId: number,
    data: UpdateProductVariantRequest,
  ): Promise<ProductVariant> {
    return request(`/products/${productId}/variants/${variantId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  deleteProductVariant(productId: number, variantId: number): Promise<void> {
    return request(`/products/${productId}/variants/${variantId}`, {
      method: 'DELETE',
      tokenOwner: 'employee',
    });
  },

  // Customer orders and receipt
  createOrder(
    data: CreateOrderRequest,
    options: { expectedCustomerId: number; idempotencyKey?: string },
  ): Promise<CustomerOrder> {
    if (data.paymentMethod === 'payos' && !options.idempotencyKey) {
      throw new Error('PayOS order creation requires an Idempotency-Key.');
    }

    const headers = new Headers();
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    return request('/orders', {
      method: 'POST',
      tokenOwner: 'customer',
      expectedPrincipalId: options.expectedCustomerId,
      headers,
      body: data,
    });
  },

  getCustomerOrders(params: PaginationParams = {}): Promise<PaginatedResult<CustomerOrderSummary>> {
    return request(withQuery('/orders', params), { tokenOwner: 'customer' });
  },

  getCustomerOrder(orderId: number | string): Promise<CustomerOrder> {
    return request(`/orders/${orderId}`, { tokenOwner: 'customer' });
  },

  cancelCustomerOrder(orderId: number | string): Promise<CustomerOrder> {
    return request(`/orders/${orderId}/cancel`, { method: 'POST', tokenOwner: 'customer' });
  },

  getCustomerInvoice(orderId: number | string): Promise<InvoiceSummary> {
    return request(`/orders/${orderId}/invoice`, { tokenOwner: 'customer' });
  },

  // Employee order processing and receipt
  getAdminOrders(params: AdminOrderQuery = {}): Promise<PaginatedResult<AdminOrderSummary>> {
    return request(withQuery('/admin/orders', params), { tokenOwner: 'employee' });
  },

  getAdminOrder(orderId: number | string): Promise<AdminOrder> {
    return request(`/admin/orders/${orderId}`, { tokenOwner: 'employee' });
  },

  packAdminOrder(
    orderId: number | string,
    data: { packingType?: 'bag' | 'box' | null; note?: string | null } = {},
  ): Promise<AdminOrder> {
    return request(`/admin/orders/${orderId}/pack`, {
      method: 'POST',
      tokenOwner: 'employee',
      body: data,
    });
  },

  markAdminOrderPaid(orderId: number | string): Promise<AdminOrder> {
    return request(`/admin/orders/${orderId}/mark-paid`, {
      method: 'POST',
      tokenOwner: 'employee',
    });
  },

  getAdminInvoice(orderId: number | string): Promise<InvoiceSummary> {
    return request(`/admin/orders/${orderId}/invoice`, { tokenOwner: 'employee' });
  },

  // Employee account administration
  getEmployees(params: PaginationParams = {}): Promise<PaginatedResult<EmployeeRecord>> {
    return request(withQuery('/admin/employees', params), { tokenOwner: 'employee' });
  },

  createEmployee(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    position: string;
    role: EmployeeRole;
  }): Promise<EmployeeRecord> {
    return request('/admin/employees', { method: 'POST', tokenOwner: 'employee', body: data });
  },

  updateEmployeeAccess(
    employeeId: number,
    data: { role?: EmployeeRole; status?: EmployeeStatus },
  ): Promise<EmployeeRecord> {
    return request(`/admin/employees/${employeeId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  // Promotions and vouchers
  getPromotions(): Promise<Promotion[]> {
    return request('/promotions', { tokenOwner: 'employee' });
  },

  getPromotion(promotionId: number): Promise<Promotion> {
    return request(`/promotions/${promotionId}`, { tokenOwner: 'employee' });
  },

  createPromotion(data: {
    name: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    status?: 'active' | 'inactive';
  }): Promise<Promotion> {
    return request('/promotions', { method: 'POST', tokenOwner: 'employee', body: data });
  },

  updatePromotion(
    promotionId: number,
    data: {
      name?: string;
      description?: string | null;
      startDate?: string;
      endDate?: string;
      status?: 'active' | 'inactive';
    },
  ): Promise<Promotion> {
    return request(`/promotions/${promotionId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  getVouchers(promotionId: number): Promise<Voucher[]> {
    return request(`/promotions/${promotionId}/vouchers`, { tokenOwner: 'employee' });
  },

  getVoucher(promotionId: number, voucherId: number): Promise<Voucher> {
    return request(`/promotions/${promotionId}/vouchers/${voucherId}`, { tokenOwner: 'employee' });
  },

  createVoucher(
    promotionId: number,
    data: {
      code: string;
      name: string;
      type: 'fixed' | 'percentage';
      discountValue: string;
      startDate: string;
      endDate: string;
      minPrice: string;
      maxDiscount?: string | null;
      quantity: number;
      status?: 'active' | 'inactive';
    },
  ): Promise<Voucher> {
    return request(`/promotions/${promotionId}/vouchers`, {
      method: 'POST',
      tokenOwner: 'employee',
      body: data,
    });
  },

  updateVoucher(
    promotionId: number,
    voucherId: number,
    data: {
      name?: string;
      type?: 'fixed' | 'percentage';
      discountValue?: string;
      startDate?: string;
      endDate?: string;
      minPrice?: string;
      maxDiscount?: string | null;
      quantity?: number;
      status?: 'active' | 'inactive';
    },
  ): Promise<Voucher> {
    return request(`/promotions/${promotionId}/vouchers/${voucherId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  // Suppliers and import documents
  getSuppliers(): Promise<Supplier[]> {
    return request('/suppliers', { tokenOwner: 'employee' });
  },

  getSupplier(supplierId: number): Promise<Supplier> {
    return request(`/suppliers/${supplierId}`, { tokenOwner: 'employee' });
  },

  createSupplier(data: { name: string; address?: string | null; email?: string | null }): Promise<Supplier> {
    return request('/suppliers', { method: 'POST', tokenOwner: 'employee', body: data });
  },

  updateSupplier(
    supplierId: number,
    data: { name?: string; address?: string | null; email?: string | null },
  ): Promise<Supplier> {
    return request(`/suppliers/${supplierId}`, {
      method: 'PATCH',
      tokenOwner: 'employee',
      body: data,
    });
  },

  deleteSupplier(supplierId: number): Promise<void> {
    return request(`/suppliers/${supplierId}`, { method: 'DELETE', tokenOwner: 'employee' });
  },

  getImports(): Promise<ImportRecord[]> {
    return request('/imports', { tokenOwner: 'employee' });
  },

  getImport(importId: number): Promise<ImportRecord> {
    return request(`/imports/${importId}`, { tokenOwner: 'employee' });
  },

  createImport(data: CreateImportRequest): Promise<ImportRecord> {
    return request('/imports', { method: 'POST', tokenOwner: 'employee', body: data });
  },
};
