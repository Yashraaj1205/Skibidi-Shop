import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { OrderStatus } from '../types';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();
const VALID: OrderStatus[] = ['pending', 'shipped', 'delivered'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.use(authenticateToken, requireAdmin);

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { customer_name, product_name, status = 'pending', customer_email = null } = req.body;

  if (typeof customer_name !== 'string' || typeof product_name !== 'string') {
    res.status(400).json({ error: 'customer_name and product_name required' });
    return;
  }

  const name = customer_name.trim();
  const product = product_name.trim();
  if (!name || name.length > 120 || !product || product.length > 200) {
    res.status(400).json({ error: 'customer_name and product_name must be 1-120 / 1-200 characters' });
    return;
  }

  if (!VALID.includes(status)) {
    res.status(400).json({ error: `status must be: ${VALID.join(', ')}` });
    return;
  }

  let email: string | null = null;
  if (customer_email !== null && customer_email !== undefined && customer_email !== '') {
    if (typeof customer_email !== 'string' || !EMAIL_RE.test(customer_email) || customer_email.length > 254) {
      res.status(400).json({ error: 'customer_email must be a valid email address' });
      return;
    }
    email = customer_email;
  }

  try {
    const result = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, product_name, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [name, email, product, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'id must be a positive integer' }); return; }

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'id must be a positive integer' }); return; }

  try {
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
