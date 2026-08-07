import { Response } from 'express';

export function respondWithServerError(res: Response, context: string, err: unknown): void {
  console.error(`${context}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
}
