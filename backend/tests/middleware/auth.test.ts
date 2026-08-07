import { NextFunction, Response } from 'express';

const verifyIdToken = jest.fn();
jest.mock('../../src/config/firebase', () => ({ getAuth: () => ({ verifyIdToken }) }));

import { AuthenticatedRequest, authenticateToken, requireAdmin } from '../../src/middleware/auth';

function makeRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

function makeReq(authorization?: string): AuthenticatedRequest {
  return { headers: authorization ? { authorization } : {} } as AuthenticatedRequest;
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('authenticateToken', () => {
  it('rejects requests without an Authorization header', async () => {
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await authenticateToken(makeReq(), res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Access token required' });
    expect(next).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects a header with a scheme but no token', async () => {
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await authenticateToken(makeReq('Bearer'), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('populates req.user from the decoded token and calls next', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'uid-1',
      email: 'a@example.com',
      name: 'Ada Lovelace',
      picture: 'https://cdn/a.png',
    });
    const req = makeReq('Bearer good-token');
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await authenticateToken(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('good-token');
    expect(req.user).toEqual({
      firebase_uid: 'uid-1',
      email: 'a@example.com',
      display_name: 'Ada Lovelace',
      photo_url: 'https://cdn/a.png',
      is_admin: false,
    });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeUndefined();
  });

  it('marks allowlisted emails as admins', async () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';
    verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'Owner@Example.com' });
    const req = makeReq('Bearer t');

    await authenticateToken(req, makeRes(), jest.fn() as NextFunction);

    expect(req.user?.is_admin).toBe(true);
  });

  it('derives display_name from the email local part when name is missing', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-2', email: 'grace@example.com' });
    const req = makeReq('Bearer t');

    await authenticateToken(req, makeRes(), jest.fn() as NextFunction);

    expect(req.user).toEqual({
      firebase_uid: 'uid-2',
      email: 'grace@example.com',
      display_name: 'grace',
      photo_url: undefined,
      is_admin: false,
    });
  });

  it('falls back to "Customer" when neither name nor email are present', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-3' });
    const req = makeReq('Bearer t');

    await authenticateToken(req, makeRes(), jest.fn() as NextFunction);

    expect(req.user).toEqual({
      firebase_uid: 'uid-3',
      email: '',
      display_name: 'Customer',
      photo_url: undefined,
      is_admin: false,
    });
  });

  it('responds 403 when verification fails', async () => {
    verifyIdToken.mockRejectedValue(new Error('expired'));
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await authenticateToken(makeReq('Bearer bad'), res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 403 when Firebase is not initialized', async () => {
    const firebase = require('../../src/config/firebase');
    const spy = jest.spyOn(firebase, 'getAuth').mockImplementation(() => {
      throw new Error('Firebase Admin is not initialized');
    });
    const res = makeRes();

    await authenticateToken(makeReq('Bearer t'), res, jest.fn() as NextFunction);

    expect(res.statusCode).toBe(403);
    spy.mockRestore();
  });
});

describe('requireAdmin', () => {
  const user = {
    firebase_uid: 'uid-1',
    email: 'owner@example.com',
    display_name: 'Owner',
    is_admin: true,
  };

  it('passes admins through', () => {
    const req = { ...makeReq('Bearer t'), user } as AuthenticatedRequest;
    const next = jest.fn() as NextFunction;
    const res = makeRes();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeUndefined();
  });

  it('responds 401 when there is no authenticated user', () => {
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    requireAdmin(makeReq(), res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 403 for authenticated non-admins', () => {
    const req = {
      ...makeReq('Bearer t'),
      user: { ...user, is_admin: false },
    } as AuthenticatedRequest;
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    requireAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Admin privileges required' });
    expect(next).not.toHaveBeenCalled();
  });
});
