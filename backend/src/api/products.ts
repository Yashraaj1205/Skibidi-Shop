import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE in_stock = TRUE ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Products fetch failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
