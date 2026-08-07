import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

type AuthenticatedUser = NonNullable<AuthenticatedRequest['user']>;

export function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

export function serverError(res: Response, err: unknown, context: string): void {
  console.error(`${context}:`, err);
  sendError(res, 500, 'Internal server error');
}

export function requireUser(
  req: AuthenticatedRequest,
  res: Response
): req is AuthenticatedRequest & { user: AuthenticatedUser } {
  if (!req.user) {
    sendError(res, 401, 'Unauthorized');
    return false;
  }
  return true;
}
