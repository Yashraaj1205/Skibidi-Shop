export type OrderStatus = 'pending' | 'shipped' | 'delivered';

export interface User {
  id: number;
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  parent_id?: number | null;
  product_count?: number;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  original_price?: number;
  discount_pct?: number;
  image_url: string;
  image_urls?: string[];
  category: string;
  category_id?: number | null;
  brand?: string;
  rating?: number;
  review_count?: number;
  tags?: string[];
  stock_quantity?: number;
  in_stock: boolean;
  created_at: string;
}

export interface Review {
  id: number;
  product_id: number;
  user_id: number;
  user_name?: string;
  user_photo?: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface CartItem {
  id: number;
  user_id: number;
  product_id: number;
  quantity: number;
  added_at: string;
  product?: Product;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_email?: string;
  user_id?: number | null;
  product_name: string;
  status: OrderStatus;
  shipping_address?: string;
  payment_method?: string;
  total_amount?: number;
  coupon_code?: string;
  phone?: string;
  updated_at: string;
}

export type DBOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface OrderEvent {
  operation: DBOperation;
  data: Order;
  timestamp: string;
}
