import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

router.post('/orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { product_id } = req.body;
  if (!product_id) { res.status(400).json({ error: 'product_id is required' }); return; }

  try {
    const userResult = await pool.query(
      'SELECT id, display_name, email FROM users WHERE firebase_uid = $1',
      [req.user.firebase_uid]
    );
    if (userResult.rowCount === 0) {
      res.status(400).json({ error: 'Profile not synced' });
      return;
    }

    const user = userResult.rows[0];

    const productResult = await pool.query(
      'SELECT name, price FROM products WHERE id = $1 AND in_stock = TRUE',
      [product_id]
    );
    if (productResult.rowCount === 0) {
      res.status(404).json({ error: 'Product not found or out of stock' });
      return;
    }

    const product = productResult.rows[0];

    const orderResult = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, user_id, product_name, status, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW()) RETURNING *`,
      [user.display_name, user.email, user.id, product.name]
    );

    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    console.error('Order placement failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const result = await pool.query(
      `SELECT o.* FROM orders o JOIN users u ON o.user_id = u.id
       WHERE u.firebase_uid = $1 ORDER BY o.id DESC`,
      [req.user.firebase_uid]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Orders fetch failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
