import { Request, Response, NextFunction } from 'express';
import { getAuth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  user?: {
    firebase_uid: string;
    email: string;
    display_name: string;
    photo_url?: string;
  };
}

const REJECTED_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled'
]);

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
    req.user = {
      firebase_uid: decoded.uid,
      email: decoded.email || '',
      display_name: decoded.name || decoded.email?.split('@')[0] || 'Customer',
      photo_url: decoded.picture || undefined
    };
    next();
  } catch (err) {
    const code = (err as { code?: string }).code;

    if (code && REJECTED_TOKEN_CODES.has(code)) {
      console.warn(`Token rejected (${code})`);
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }

    console.error('Token verification failed unexpectedly:', err);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}
