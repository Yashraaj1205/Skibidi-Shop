import { Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { HttpError } from '../middleware/error';
import { AuthenticatedRequest, authenticateToken, requireAdmin } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';

const router = Router();

router.use(authenticateToken, requireAdmin);

const idParams = z.object({ id: z.coerce.number().int().positive() });

const createOrder = z.object({
  customer_name: z.string().trim().min(1).max(120),
  product_name: z.string().trim().min(1).max(200),
  customer_email: z.string().trim().email().max(200).nullish().default(null),
  status: z.enum(['pending', 'shipped', 'delivered']).default('pending')
});

const updateStatus = z.object({
  status: z.enum(['pending', 'shipped', 'delivered'])
});

router.get(
  '/',
  asyncHandler(async (_req, res: Response) => {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  })
);

router.post(
  '/',
  validateBody(createOrder),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { customer_name, customer_email, product_name, status } = req.body;
    const result = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, product_name, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [customer_name, customer_email, product_name, status]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.patch(
  '/:id',
  validateParams(idParams),
  validateBody(updateStatus),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.status, req.params.id]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Not found');
    res.json(result.rows[0]);
  })
);

router.delete(
  '/:id',
  validateParams(idParams),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [
      req.params.id
    ]);
    if (result.rowCount === 0) throw new HttpError(404, 'Not found');
    res.json({ deleted: result.rows[0] });
  })
);

export default router;
