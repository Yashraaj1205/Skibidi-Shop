import { Response, Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { AuthenticatedRequest, authenticateToken, currentUser } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// Authenticating already upserts the profile and resolves roles, so both routes just report it.
const me = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = currentUser(req);
  res.json({
    id: user.user_id,
    firebase_uid: user.firebase_uid,
    email: user.email,
    display_name: user.display_name,
    photo_url: user.photo_url || null,
    roles: user.roles,
    is_admin: user.is_admin,
    is_seller: user.is_seller,
    seller_id: user.seller_id,
    seller_status: user.seller_status
  });
});

router.post('/sync', me);
router.get('/me', me);

export default router;
