import express, { Express, NextFunction, Request, Response, Router } from 'express';
import type { Identity } from '../../src/services/identity';
import { errorHandler } from '../../src/middleware/error';

/**
 * Shared by the API suites: `authenticateToken` is replaced by a stub that injects
 * whatever identity the test set, while requireAdmin/requireSeller stay real so the
 * authorization rules themselves are under test.
 */
export const authState: { identity: Identity | null } = { identity: null };

export function mockAuthModule(): Record<string, unknown> {
  const actual = jest.requireActual('../../src/middleware/auth');
  return {
    ...actual,
    authenticateToken: (req: Request & { user?: Identity }, res: Response, next: NextFunction) => {
      if (!authState.identity) {
        res.status(401).json({ error: 'Access token required' });
        return;
      }
      req.user = authState.identity;
      next();
    }
  };
}

export function appWith(path: string, router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  app.use(errorHandler);
  return app;
}
