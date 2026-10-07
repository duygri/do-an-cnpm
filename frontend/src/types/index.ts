/** Money values returned by the API are decimal strings, never JS floats. */
export type MoneyAmount = string;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface Category {
  categoryId: number;
  name: string;
  description?: string | null;
}

export interface ProductImage {
  productImageId: number;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductImageInput {
  imageUrl: string;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string | null;
}

export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;

export interface ProductVariant {
  variantId: number;
  size: string | null;
  color: string | null;
  price: MoneyAmount;
  /** Returned by employee catalog endpoints and import-detail relations. */
  productId?: number;
}

export interface StoreProductSummary {
  productId: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: Pick<Category, 'categoryId' | 'name'>;
  priceFrom: MoneyAmount | null;
  primaryImageUrl: string | null;
}

export interface StoreProductDetail {
  productId: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: Category;
  variants: ProductVariant[];
  images: ProductImage[];
}

export interface ProductResource {
  productId: number;
  name: string;
  description: string | null;
  brand: string | null;
  status: string;
  categoryId: number;
  category?: Category;
  images?: ProductImage[];
}

export interface CreateProductRequest {
  name: string;
  categoryId: number;
  description?: string | null;
  brand?: string | null;
  status?: string;
  images?: ProductImageInput[];
}

export type UpdateProductRequest = Partial<CreateProductRequest>;

export interface CreateProductVariantRequest {
  size?: string | null;
  color?: string | null;
  price: number;
}

export type UpdateProductVariantRequest = Partial<CreateProductVariantRequest>;

export interface CartItem {
  productId: number;
  variantId: number;
  name: string;
  size: string | null;
  color: string | null;
  /** A display estimate captured from the selected backend variant. */
  price: MoneyAmount;
  quantity: number;
  imageUrl?: string;
}

export interface CustomerProfile {
  customerId: number;
  name?: string;
  email: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  address?: string | null;
  gender?: string | null;
}

export type EmployeeRole = 'admin' | 'manager';

export type EmployeeStatus = 'active' | 'inactive';

export interface EmployeeProfile {
  employeeId: number;
  name: string;
  email: string;
  position: string;
  role: EmployeeRole;
  status?: EmployeeStatus;
}

export interface AuthResponse<TProfile> {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  customer?: TProfile;
  employee?: TProfile;
}

export type CustomerAuthResponse = AuthResponse<CustomerProfile> & {
  customer: CustomerProfile;
};

export type EmployeeAuthResponse = AuthResponse<EmployeeProfile> & {
  employee: EmployeeProfile;
};

export type OrderStatus = 'pending' | 'packed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid';
export type PaymentMethod = 'cod' | 'payos';

export interface OrderDetail {
  orderId: number;
  variantId: number;
  quantity: number;
  unitPrice: MoneyAmount;
  subtotal: MoneyAmount;
  productName: string;
  size: string | null;
  color: string | null;
}

export interface CustomerOrderSummary {
  orderId: number;
  orderDate: string;
  customerId: number;
  voucherId: number | null;
  voucherCode: string | null;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  discountAmount: MoneyAmount;
  shippingFee: MoneyAmount;
  totalAmount: MoneyAmount;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  note: string | null;
}

export interface CustomerOrder extends CustomerOrderSummary {
  details: OrderDetail[];
  checkoutUrl?: string;
  paymentExpiresAt?: string;
}

/** Backward-compatible name retained while existing order UI is migrated. */
export type Order = CustomerOrder;

export interface CreateOrderDetail {
  variantId: number;
  quantity: number;
}

export interface CreateOrderRequest {
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  details: CreateOrderDetail[];
  note?: string | null;
  voucherCode?: string;
  paymentMethod: PaymentMethod;
}

export interface AdminOrderSummary {
  orderId: number;
  orderDate: string;
  customerId: number;
  recipientName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  voucherCode: string | null;
  discountAmount: MoneyAmount;
  totalAmount: MoneyAmount;
  detailCount: number;
}

export interface PackingRecord {
  packingId: number;
  packingDate: string;
  packingType: 'bag' | 'box' | null;
  status: 'packed';
  note: string | null;
  employeeId: number;
}

export interface PaymentAttemptSummary {
  status: string;
  providerReference: string | null;
  observedAmountPaid: MoneyAmount | null;
  reconciliationReason: string | null;
  reconciliationAt: string | null;
  checkoutUrlMissing: boolean;
}

export interface AdminOrder {
  orderId: number;
  orderDate: string;
  customerId: number;
  voucherCode: string | null;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  discountAmount: MoneyAmount;
  shippingFee: MoneyAmount;
  totalAmount: MoneyAmount;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  note: string | null;
  paymentConfirmedAt: string | null;
  paymentConfirmedByEmployeeId: number | null;
  paymentAttentionRequired: boolean;
  paymentAttempt: PaymentAttemptSummary | null;
  details: OrderDetail[];
  packing: PackingRecord | null;
}

export interface InvoiceSummary {
  invoiceId: number;
  orderId: number;
  issuedDate: string;
  totalAmount: MoneyAmount;
  status: string;
}

export interface RevenueReportDay {
  date: string;
  orderCount: number;
  amount: MoneyAmount;
}

/** Internal collected-order summary; this is not a tax or accounting report. */
export interface RevenueReport {
  from: string;
  to: string;
  timezone: 'Asia/Ho_Chi_Minh';
  paidOrderCount: number;
  collectedAmount: MoneyAmount;
  daily: RevenueReportDay[];
}

export interface EmployeeRecord extends EmployeeProfile {
  phone: string | null;
  status: EmployeeStatus;
}

export interface Promotion {
  promotionId: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive';
}

export interface Voucher {
  voucherId: number;
  promotionId: number;
  code: string;
  name: string;
  type: 'fixed' | 'percentage';
  discountValue: MoneyAmount;
  startDate: string;
  endDate: string;
  minPrice: MoneyAmount;
  maxDiscount: MoneyAmount | null;
  quantity: number;
  status: 'active' | 'inactive';
}

export interface Supplier {
  supplierId: number;
  name: string;
  address: string | null;
  email: string | null;
}

export interface ImportDetail {
  importId: number;
  variantId: number;
  quantity: number;
  unitPrice: MoneyAmount;
  subtotal: MoneyAmount;
  variant?: ProductVariant;
}

export interface ImportRecord {
  importId: number;
  importDate: string;
  totalAmount: MoneyAmount;
  note: string | null;
  supplierId: number;
  employeeId: number;
  supplier?: Supplier;
  details?: ImportDetail[];
}

/** @deprecated Prefer ImportRecord; import documents do not track inventory balance. */
export type StockImport = ImportRecord;
