export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled'
];

export type RoleKey = 'customer' | 'seller' | 'admin';
export type SellerStatus = 'pending' | 'active' | 'suspended';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';
export type PayoutStatus = 'pending' | 'paid' | 'failed';

export interface User {
  id: number;
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  created_at: string;
}

export interface Seller {
  id: number;
  user_id: number;
  name: string;
  slug: string;
  description: string;
  support_email?: string | null;
  payout_email?: string | null;
  commission_bps: number;
  status: SellerStatus;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  seller_id: number;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  currency: string;
  image_url: string;
  category: string;
  stock: number;
  status: ProductStatus;
  in_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
}

export interface Address {
  id: number;
  user_id: number;
  full_name: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone?: string | null;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email?: string;
  user_id?: number | null;
  product_name: string;
  status: OrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  currency: string;
  shipping_address_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  seller_id: number | null;
  product_name: string;
  product_image_url: string;
  unit_price_cents: number;
  quantity: number;
  commission_bps: number;
  commission_cents: number;
  seller_earnings_cents: number;
  payout_id: number | null;
}

export interface Payment {
  id: number;
  order_id: number;
  provider: string;
  provider_ref?: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
}

export interface Payout {
  id: number;
  seller_id: number;
  amount_cents: number;
  currency: string;
  status: PayoutStatus;
  created_at: string;
  paid_at?: string | null;
}

export type DBOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface OrderEvent {
  operation: DBOperation;
  data: Order;
  timestamp: string;
}
