import type { Identity } from '../../src/services/identity';
import type { Order } from '../../src/types';

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 42,
    order_number: 'SKB-000042',
    customer_name: 'Ada',
    customer_email: 'ada@example.com',
    user_id: 7,
    product_name: 'PlayStation 5',
    status: 'pending',
    subtotal_cents: 49999,
    shipping_cents: 0,
    total_cents: 49999,
    currency: 'USD',
    shipping_address_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  };
}

export function makeIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    user_id: 7,
    firebase_uid: 'uid-7',
    email: 'ada@example.com',
    display_name: 'Ada',
    photo_url: undefined,
    roles: ['customer'],
    is_admin: false,
    is_seller: false,
    seller_id: null,
    seller_status: null,
    ...overrides
  };
}
