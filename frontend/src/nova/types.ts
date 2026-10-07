export interface Category {
  categoryId: number;
  name: string;
  description?: string | null;
}
export interface ProductSummary {
  productId: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: Category;
  priceFrom: string | null;
  primaryImageUrl: string | null;
}
export interface Variant {
  variantId: number;
  size: string | null;
  color: string | null;
  price: string;
}
export interface ProductImage {
  productImageId: number;
  imageUrl: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
}
export interface Product extends Omit<
  ProductSummary,
  "priceFrom" | "primaryImageUrl"
> {
  variants: Variant[];
  images: ProductImage[];
}
export interface Customer {
  customerId: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
}
export interface AuthResponse {
  access_token: string;
  expires_in: number;
  customer: Customer;
}
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
export interface CartItem {
  productId: number;
  variantId: number;
  quantity: number;
}
export interface OrderLine {
  variantId: number;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  productName?: string | null;
  size?: string | null;
  color?: string | null;
}
export interface Order {
  orderId: number;
  orderDate: string;
  status: "pending" | "packed" | "cancelled";
  paymentStatus: "paid" | "unpaid";
  paymentMethod: "cod" | "payos" | null;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  note: string | null;
  voucherCode: string | null;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  details?: OrderLine[];
}
export interface CreateOrder {
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  note?: string;
  voucherCode?: string;
  paymentMethod: "cod";
  details: { variantId: number; quantity: number }[];
}
