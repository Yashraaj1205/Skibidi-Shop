import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// POST /api/store/orders — Purchase a product (creates order)
router.post('/orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { product_id } = req.body;
  if (!product_id) {
    res.status(400).json({ error: 'product_id is required' });
    return;
  }

  try {
    // 1. Fetch user ID from local DB
    const userResult = await pool.query('SELECT id, display_name, email FROM users WHERE firebase_uid = $1', [
      req.user.firebase_uid
    ]);

    if (userResult.rowCount === 0) {
      res.status(400).json({ error: 'User profile out of sync. Sync profile first.' });
      return;
    }

    const localUser = userResult.rows[0];

    // 2. Fetch product details
    const productResult = await pool.query('SELECT name, price FROM products WHERE id = $1 AND in_stock = TRUE', [
      product_id
    ]);

    if (productResult.rowCount === 0) {
      res.status(404).json({ error: 'Product not found or out of stock' });
      return;
    }

    const product = productResult.rows[0];

    // 3. Create the order (triggers PL/pgSQL pg_notify trigger which automatically sends email!)
    const orderResult = await pool.query(
      `INSERT INTO orders (customer_name, customer_email, user_id, product_name, status, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       RETURNING *`,
      [localUser.display_name, localUser.email, localUser.id, product.name]
    );

    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    console.error('Failed to place order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/store/my-orders — Fetch active user's purchase history
router.get('/my-orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT o.* FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE u.firebase_uid = $1
       ORDER BY o.id DESC`,
      [req.user.firebase_uid]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch user orders:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
