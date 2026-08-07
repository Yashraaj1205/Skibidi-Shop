import { Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { AuthenticatedRequest, authenticateToken, currentUser } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { validateBody, validateParams } from '../middleware/validate';
import { shippingCentsFor } from '../services/checkout';

const router = Router();

router.use(authenticateToken);

async function cartIdFor(userId: number): Promise<number> {
  const result = await pool.query(
    `INSERT INTO carts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [userId]
  );
  return result.rows[0].id;
}

async function cartFor(userId: number) {
  const cartId = await cartIdFor(userId);
  const items = await pool.query(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name, p.slug, p.image_url, p.price_cents, p.currency, p.stock, p.status,
            s.name AS seller_name, s.slug AS seller_slug,
            (p.price_cents * ci.quantity) AS line_total_cents
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN sellers s ON s.id = p.seller_id
      WHERE ci.cart_id = $1
      ORDER BY ci.id ASC`,
    [cartId]
  );

  const subtotal = items.rows.reduce(
    (sum: number, row: { line_total_cents: number }) => sum + Number(row.line_total_cents),
    0
  );
  const shipping = items.rowCount === 0 ? 0 : shippingCentsFor(subtotal);

  return {
    id: cartId,
    items: items.rows,
    currency: items.rowCount === 0 ? 'USD' : items.rows[0].currency,
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    total_cents: subtotal + shipping
  };
}

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await cartFor(currentUser(req).user_id));
  })
);

const addItem = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20).default(1)
});

router.post(
  '/items',
  validateBody(addItem),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    const { product_id: productId, quantity } = req.body as z.infer<typeof addItem>;

    const product = await pool.query(
      `SELECT p.stock FROM products p JOIN sellers s ON s.id = p.seller_id
        WHERE p.id = $1 AND p.status = 'active' AND s.status = 'active'`,
      [productId]
    );
    if (product.rowCount === 0) throw new HttpError(404, 'Product not available');

    const cartId = await cartIdFor(user.user_id);
    const result = await pool.query(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + $3, $4)
       RETURNING quantity`,
      [cartId, productId, quantity, Math.max(product.rows[0].stock, 1)]
    );

    if (result.rows[0].quantity > product.rows[0].stock) {
      throw new HttpError(409, `Only ${product.rows[0].stock} left in stock`);
    }

    res.status(201).json(await cartFor(user.user_id));
  })
);

const itemParams = z.object({ id: z.coerce.number().int().positive() });
const updateItem = z.object({ quantity: z.coerce.number().int().min(1).max(20) });

router.patch(
  '/items/:id',
  validateParams(itemParams),
  validateBody(updateItem),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    const result = await pool.query(
      `UPDATE cart_items ci
          SET quantity = $3
        WHERE ci.id = $1
          AND ci.cart_id IN (SELECT id FROM carts WHERE user_id = $2)
          AND $3 <= (SELECT stock FROM products WHERE id = ci.product_id)
        RETURNING ci.id`,
      [req.params.id, user.user_id, req.body.quantity]
    );
    if (result.rowCount === 0) throw new HttpError(409, 'Cart item not found or not enough stock');

    res.json(await cartFor(user.user_id));
  })
);

router.delete(
  '/items/:id',
  validateParams(itemParams),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    const result = await pool.query(
      `DELETE FROM cart_items
        WHERE id = $1 AND cart_id IN (SELECT id FROM carts WHERE user_id = $2)`,
      [req.params.id, user.user_id]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Cart item not found');

    res.json(await cartFor(user.user_id));
  })
);

router.delete(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = currentUser(req);
    await pool.query(
      'DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)',
      [user.user_id]
    );
    res.json(await cartFor(user.user_id));
  })
);

export default router;
