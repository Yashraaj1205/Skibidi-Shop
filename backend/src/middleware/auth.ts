import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  user?: {
    firebase_uid: string;
    email: string;
    display_name: string;
    photo_url?: string;
  };
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
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      firebase_uid: decoded.uid,
      email: decoded.email || '',
      display_name: decoded.name || decoded.email?.split('@')[0] || 'Customer',
      photo_url: decoded.picture || undefined
    };
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
