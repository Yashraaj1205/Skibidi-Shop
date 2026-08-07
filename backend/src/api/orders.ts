import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { OrderStatus } from '../types';
import { respondWithServerError } from '../utils/http';

const router = Router();
const VALID: OrderStatus[] = ['pending', 'shipped', 'delivered'];

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    respondWithServerError(res, 'Orders fetch failed', err);
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { customer_name, product_name, status = 'pending', customer_email = null } = req.body;
  if (!customer_name || !product_name) {
    res.status(400).json({ error: 'customer_name and product_name required' });
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
    respondWithServerError(res, 'Order creation failed', err);
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status: OrderStatus };

  if (!VALID.includes(status)) {
    res.status(400).json({ error: `status must be: ${VALID.join(', ')}` });
    return;
  }

  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    respondWithServerError(res, `Order status update failed for order ${id}`, err);
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ deleted: result.rows[0] });
  } catch (err) {
    respondWithServerError(res, `Order deletion failed for order ${id}`, err);
  }
});

export default router;
