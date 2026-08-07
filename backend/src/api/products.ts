import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { serverError } from '../utils/http';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE in_stock = TRUE ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    serverError(res, err, 'Products fetch failed');
  }
});

export default router;
