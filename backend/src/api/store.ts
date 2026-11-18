import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { respondWithServerError } from '../utils/http';

const router = Router();

router.post('/orders', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const {
    product_id,
    quantity = 1,
    shipping_name,
    shipping_address,
    phone,
    payment_method = 'Credit / Debit Card',
    coupon_code,
    total_amount
  } = req.body;

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
    const customerName = (shipping_name && typeof shipping_name === 'string' && shipping_name.trim()) || user.display_name;
    const finalAmount = total_amount ? parseFloat(total_amount) : (parseFloat(product.price) * (parseInt(quantity, 10) || 1));

    const orderResult = await pool.query(
      `INSERT INTO orders (
        customer_name, customer_email, user_id, product_name, status,
        shipping_address, payment_method, total_amount, coupon_code, phone, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [
        customerName,
        user.email,
        user.id,
        quantity > 1 ? `${quantity}x ${product.name}` : product.name,
        shipping_address || 'Standard Delivery',
        payment_method,
        finalAmount,
        coupon_code || null,
        phone || null
      ]
    );

    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Order placement failed', err);
  }
});

router.post('/checkout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const {
    shipping_name,
    shipping_address,
    phone,
    payment_method = 'Credit / Debit Card',
    coupon_code,
    total_amount
  } = req.body;

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

    const cartResult = await pool.query(`
      SELECT c.quantity, p.name, p.price, p.in_stock, p.stock_quantity
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
    `, [user.id]);

    if (cartResult.rowCount === 0) {
      res.status(400).json({ error: 'Your cart is empty' });
      return;
    }

    const items = cartResult.rows;
    const summary = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    const customerName = (shipping_name && typeof shipping_name === 'string' && shipping_name.trim()) || user.display_name;

    let computedTotal = 0;
    items.forEach(i => { computedTotal += parseFloat(i.price) * i.quantity; });
    const finalAmount = total_amount ? parseFloat(total_amount) : computedTotal;

    const orderResult = await pool.query(
      `INSERT INTO orders (
        customer_name, customer_email, user_id, product_name, status,
        shipping_address, payment_method, total_amount, coupon_code, phone, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [
        customerName,
        user.email,
        user.id,
        summary.substring(0, 250),
        shipping_address || 'Standard Delivery',
        payment_method,
        finalAmount,
        coupon_code || null,
        phone || null
      ]
    );

    // Clear cart after checkout
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [user.id]);

    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Checkout failed', err);
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
    respondWithServerError(res, 'Customer orders fetch failed', err);
  }
});

export default router;
