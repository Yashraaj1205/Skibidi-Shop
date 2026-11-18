import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { respondWithServerError } from '../utils/http';

const router = Router();

// Helper to get local user ID from Firebase UID
async function getUserId(firebaseUid: string): Promise<number | null> {
  const res = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [firebaseUid]);
  return res.rowCount && res.rows[0].id ? res.rows[0].id : null;
}

// GET /api/cart - Get current user's cart
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const userId = await getUserId(req.user.firebase_uid);
    if (!userId) {
      res.json([]);
      return;
    }

    const result = await pool.query(`
      SELECT
        c.id, c.quantity, c.added_at,
        p.id AS product_id, p.name, p.price, p.original_price, p.discount_pct,
        p.image_url, p.category, p.brand, p.stock_quantity, p.in_stock
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY c.added_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    respondWithServerError(res, 'Failed to fetch cart', err);
  }
});

// POST /api/cart - Add item to cart or increment quantity
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { product_id, quantity = 1 } = req.body;
  const qty = parseInt(quantity, 10);
  if (!product_id || isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: 'product_id and valid positive quantity are required' });
    return;
  }

  try {
    const userId = await getUserId(req.user.firebase_uid);
    if (!userId) {
      res.status(400).json({ error: 'User profile not found. Please sync first.' });
      return;
    }

    // Check product in stock
    const prodRes = await pool.query('SELECT id, name, in_stock, stock_quantity FROM products WHERE id = $1', [product_id]);
    if (prodRes.rowCount === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const prod = prodRes.rows[0];
    if (!prod.in_stock || prod.stock_quantity <= 0) {
      res.status(400).json({ error: `${prod.name} is currently out of stock` });
      return;
    }

    // Upsert into cart_items
    const upsertRes = await pool.query(`
      INSERT INTO cart_items (user_id, product_id, quantity, added_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, product_id)
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
      RETURNING *
    `, [userId, product_id, qty]);

    res.status(201).json(upsertRes.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Failed to add item to cart', err);
  }
});

// PATCH /api/cart/:itemId - Update item quantity
router.patch('/:itemId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { itemId } = req.params;
  const { quantity } = req.body;
  const qty = parseInt(quantity, 10);

  if (isNaN(qty) || qty < 0) {
    res.status(400).json({ error: 'Valid quantity is required' });
    return;
  }

  try {
    const userId = await getUserId(req.user.firebase_uid);
    if (!userId) {
      res.status(400).json({ error: 'User profile not found' });
      return;
    }

    if (qty === 0) {
      // Remove item if quantity is 0
      await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [itemId, userId]);
      res.json({ message: 'Item removed from cart' });
      return;
    }

    const result = await pool.query(`
      UPDATE cart_items
      SET quantity = $1
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `, [qty, itemId, userId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Cart item not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Failed to update cart item', err);
  }
});

// DELETE /api/cart/:itemId - Remove item from cart
router.delete('/:itemId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { itemId } = req.params;

  try {
    const userId = await getUserId(req.user.firebase_uid);
    if (!userId) {
      res.status(400).json({ error: 'User profile not found' });
      return;
    }

    const result = await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING *', [itemId, userId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Cart item not found' });
      return;
    }

    res.json({ message: 'Item removed', item: result.rows[0] });
  } catch (err) {
    respondWithServerError(res, 'Failed to remove cart item', err);
  }
});

// DELETE /api/cart - Clear entire cart
router.delete('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const userId = await getUserId(req.user.firebase_uid);
    if (!userId) {
      res.status(400).json({ error: 'User profile not found' });
      return;
    }

    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    respondWithServerError(res, 'Failed to clear cart', err);
  }
});

export default router;
