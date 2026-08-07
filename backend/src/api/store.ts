import { Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { AuthenticatedRequest, authenticateToken, currentUser } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { validateBody, validateParams } from '../middleware/validate';
import { placeOrder } from '../services/checkout';

const router = Router();

router.use(authenticateToken);

const address = z.object({
  full_name: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).default(''),
  postal_code: z.string().trim().min(1).max(32),
  country: z.string().trim().min(2).max(60),
  phone: z.string().trim().max(40).nullish()
});

const checkout = z.object({ address });

router.post(
  '/checkout',
  validateBody(checkout),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    const cartItems = await pool.query(
      `SELECT ci.product_id, ci.quantity
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1
        ORDER BY ci.product_id ASC`,
      [user.user_id]
    );
    if (cartItems.rowCount === 0) throw new HttpError(400, 'Cart is empty');

    const placed = await placeOrder(user, {
      items: cartItems.rows,
      address: req.body.address,
      clear_cart: true
    });
    res.status(201).json(placed);
  })
);

const instantBuy = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20).default(1)
});

router.post(
  '/orders',
  validateBody(instantBuy),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const placed = await placeOrder(currentUser(req), {
      items: [{ product_id: req.body.product_id, quantity: req.body.quantity }]
    });
    res.status(201).json(placed.order);
  })
);

router.get(
  '/my-orders',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      `SELECT o.*,
              COALESCE(
                (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                          'id', oi.id, 'product_name', oi.product_name,
                          'product_image_url', oi.product_image_url,
                          'unit_price_cents', oi.unit_price_cents, 'quantity', oi.quantity)
                        ORDER BY oi.id)
                   FROM order_items oi WHERE oi.order_id = o.id),
                '[]'::JSON
              ) AS items
         FROM orders o
        WHERE o.user_id = $1
        ORDER BY o.id DESC
        LIMIT 50`,
      [currentUser(req).user_id]
    );
    res.json(result.rows);
  })
);

const orderParams = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/orders/:id',
  validateParams(orderParams),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    const order = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [
      req.params.id,
      user.user_id
    ]);
    if (order.rowCount === 0) throw new HttpError(404, 'Order not found');

    const [items, history, shipping] = await Promise.all([
      pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC', [req.params.id]),
      pool.query(
        'SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY id ASC',
        [req.params.id]
      ),
      pool.query('SELECT * FROM addresses WHERE id = $1', [order.rows[0].shipping_address_id])
    ]);

    res.json({
      ...order.rows[0],
      items: items.rows,
      history: history.rows,
      shipping_address: shipping.rowCount === 0 ? null : shipping.rows[0]
    });
  })
);

export default router;
