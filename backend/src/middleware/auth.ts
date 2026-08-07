import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from '../config/firebase';
import { HttpError } from './error';
import { Identity, resolveIdentity } from '../services/identity';
import { RoleKey } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: Identity;
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

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    req.user = await resolveIdentity(decoded);
    next();
  } catch (err) {
    next(err);
  }
}

export function currentUser(req: AuthenticatedRequest): Identity {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

function requireRole(role: RoleKey): RequestHandler {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!req.user.roles.includes(role)) {
      res.status(403).json({ error: `${role} privileges required` });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');

export function requireSeller(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.user.seller_id === null) {
    res.status(403).json({ error: 'Seller account required' });
    return;
  }
  if (!req.user.is_seller) {
    res.status(403).json({ error: `Seller account is ${req.user.seller_status}` });
    return;
  }
  next();
}
