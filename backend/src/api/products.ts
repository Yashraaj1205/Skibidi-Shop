import { Response, Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res: Response) => {
    const result = await pool.query(
      'SELECT * FROM products WHERE in_stock = TRUE ORDER BY id ASC'
    );
    res.json(result.rows);
  })
);

export default router;
