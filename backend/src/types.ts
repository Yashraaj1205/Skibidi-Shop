export type OrderStatus = 'pending' | 'shipped' | 'delivered';

export interface User {
  id: number;
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category: string;
  in_stock: boolean;
  created_at: string;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_email?: string;
  user_id?: number | null;
  product_name: string;
  status: OrderStatus;
  updated_at: string;
}

export type DBOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface OrderEvent {
  operation: DBOperation;
  data: Order;
  timestamp: string;
}
