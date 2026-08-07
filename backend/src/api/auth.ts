import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { respondWithServerError } from '../utils/http';

const router = Router();

router.post('/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { firebase_uid, email, display_name, photo_url } = req.user;

  try {
    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, display_name, photo_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (firebase_uid)
       DO UPDATE SET email = $2, display_name = $3, photo_url = $4
       RETURNING *`,
      [firebase_uid, email, display_name, photo_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Profile sync failed', err);
  }
});

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [req.user.firebase_uid]);
    if (result.rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    respondWithServerError(res, 'Profile fetch failed', err);
  }
});

export default router;
