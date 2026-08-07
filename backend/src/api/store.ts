import { Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { HttpError } from '../middleware/error';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

router.use(authenticateToken);

const placeOrder = z.object({
  product_id: z.coerce.number().int().positive()
});

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

router.post(
  '/orders',
  validateBody(placeOrder),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = requireUser(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        'SELECT id, display_name, email FROM users WHERE firebase_uid = $1',
        [user.firebase_uid]
      );
      if (userResult.rowCount === 0) throw new HttpError(400, 'Profile not synced');

      const productResult = await client.query(
        'SELECT name, price FROM products WHERE id = $1 AND in_stock = TRUE FOR UPDATE',
        [req.body.product_id]
      );
      if (productResult.rowCount === 0) throw new HttpError(404, 'Product not found or out of stock');

      const buyer = userResult.rows[0];
      const orderResult = await client.query(
        `INSERT INTO orders (customer_name, customer_email, user_id, product_name, status, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW()) RETURNING *`,
        [buyer.display_name, buyer.email, buyer.id, productResult.rows[0].name]
      );

      await client.query('COMMIT');
      res.status(201).json(orderResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  '/my-orders',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = requireUser(req);
    const result = await pool.query(
      `SELECT o.* FROM orders o JOIN users u ON o.user_id = u.id
       WHERE u.firebase_uid = $1 ORDER BY o.id DESC`,
      [user.firebase_uid]
    );
    res.json(result.rows);
  })
);

export default router;
