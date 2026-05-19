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
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      firebase_uid: decodedToken.uid,
      email: decodedToken.email || '',
      display_name: decodedToken.name || decodedToken.email?.split('@')[0] || 'Customer',
      photo_url: decodedToken.picture || undefined
    };
    next();
  } catch (err) {
    console.error('Firebase token verification failed:', err);
    res.status(403).json({ error: 'Invalid or expired access token' });
  }
}
