import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

// POST /api/auth/sync — Synchronize Firebase User Profile with Local Postgres database
router.post('/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

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
    console.error('Failed to sync user profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me — Get local user profile from authenticated token
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [
      req.user.firebase_uid
    ]);

    if (result.rowCount === 0) {
      res.status(440).json({ error: 'User profile out of sync' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
