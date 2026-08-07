import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { OrderStatus } from '../types';
import { sendError, serverError } from '../utils/http';

const router = Router();
const VALID: OrderStatus[] = ['pending', 'shipped', 'delivered'];

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    serverError(res, err, 'Orders fetch failed');
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { customer_name, product_name, status = 'pending', customer_email = null } = req.body;
  if (!customer_name || !product_name) {
    sendError(res, 400, 'customer_name and product_name required');
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, product_name, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [customer_name, customer_email, product_name, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    serverError(res, err, 'Order creation failed');
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status: OrderStatus };

  if (!VALID.includes(status)) {
    sendError(res, 400, `status must be: ${VALID.join(', ')}`);
    return;
  }

  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) { sendError(res, 404, 'Not found'); return; }
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err, 'Order update failed');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) { sendError(res, 404, 'Not found'); return; }
    res.json({ deleted: result.rows[0] });
  } catch (err) {
    serverError(res, err, 'Order deletion failed');
  }
});

export default router;
