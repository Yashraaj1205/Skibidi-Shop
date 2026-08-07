import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';
import { requireUser, sendError, serverError } from '../utils/http';

const router = Router();

router.post('/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;

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
    serverError(res, err, 'Sync failed');
  }
});

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;

  try {
    const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [req.user.firebase_uid]);
    if (result.rowCount === 0) { sendError(res, 404, 'Not found'); return; }
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err, 'Profile fetch failed');
  }
});

export default router;
