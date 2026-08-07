import { Response, Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../lib/asyncHandler';
import { HttpError } from '../middleware/error';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

function requireUser(req: AuthenticatedRequest) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

router.post(
  '/sync',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { firebase_uid, email, display_name, photo_url, is_admin } = requireUser(req);
    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, display_name, photo_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (firebase_uid)
       DO UPDATE SET email = $2, display_name = $3, photo_url = $4
       RETURNING *`,
      [firebase_uid, email, display_name, photo_url]
    );
    res.json({ ...result.rows[0], is_admin });
  })
);

router.get(
  '/me',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = requireUser(req);
    const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [
      user.firebase_uid
    ]);
    if (result.rowCount === 0) throw new HttpError(404, 'Not found');
    res.json({ ...result.rows[0], is_admin: user.is_admin });
  })
);

export default router;
