import { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/firebase';
import { isAdminEmail } from '../lib/roles';

export interface AuthenticatedUser {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  is_admin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = decoded.email || '';
    req.user = {
      firebase_uid: decoded.uid,
      email,
      display_name: decoded.name || email.split('@')[0] || 'Customer',
      photo_url: decoded.picture || undefined,
      is_admin: isAdminEmail(email)
    };
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!req.user.is_admin) {
    res.status(403).json({ error: 'Admin privileges required' });
    return;
  }
  next();
}
