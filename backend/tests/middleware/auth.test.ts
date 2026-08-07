import type { Response } from 'express';
import { makeIdentity } from '../helpers/fixtures';

const verifyIdToken = jest.fn();
const getAuth = jest.fn(() => ({ verifyIdToken }));
jest.mock('../../src/config/firebase', () => ({ getAuth }));

const resolveIdentity = jest.fn();
jest.mock('../../src/services/identity', () => ({ resolveIdentity }));

import {
  AuthenticatedRequest,
  authenticateToken,
  currentUser,
  requireAdmin,
  requireSeller
} from '../../src/middleware/auth';

function mockResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

beforeEach(() => {
  verifyIdToken.mockReset();
  resolveIdentity.mockReset();
});

describe('authenticateToken', () => {
  it('rejects requests without an Authorization header', async () => {
    const res = mockResponse();
    const next = jest.fn();

    await authenticateToken({ headers: {} } as AuthenticatedRequest, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Access token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a Bearer header with no token', async () => {
    const res = mockResponse();

    await authenticateToken(
      { headers: { authorization: 'Bearer' } } as AuthenticatedRequest,
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(401);
  });

  it('attaches the server-resolved identity and continues', async () => {
    const identity = makeIdentity({ roles: ['customer', 'admin'], is_admin: true });
    verifyIdToken.mockResolvedValue({ uid: 'uid-7', email: 'ada@example.com' });
    resolveIdentity.mockResolvedValue(identity);

    const req = { headers: { authorization: 'Bearer token' } } as AuthenticatedRequest;
    const next = jest.fn();

    await authenticateToken(req, mockResponse(), next);

    expect(verifyIdToken).toHaveBeenCalledWith('token');
    expect(resolveIdentity).toHaveBeenCalledWith({ uid: 'uid-7', email: 'ada@example.com' });
    expect(req.user).toBe(identity);
    expect(next).toHaveBeenCalledWith();
  });

  it('responds 403 when the token cannot be verified', async () => {
    verifyIdToken.mockRejectedValue(new Error('expired'));
    const res = mockResponse();

    await authenticateToken(
      { headers: { authorization: 'Bearer bad' } } as AuthenticatedRequest,
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });

  it('responds 403 when Firebase is not initialized', async () => {
    getAuth.mockImplementationOnce(() => {
      throw new Error('Firebase Admin is not initialized');
    });
    const res = mockResponse();

    await authenticateToken(
      { headers: { authorization: 'Bearer token' } } as AuthenticatedRequest,
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(403);
  });

  it('forwards identity lookup failures to the error handler', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-7' });
    const failure = new Error('db down');
    resolveIdentity.mockRejectedValue(failure);
    const next = jest.fn();

    await authenticateToken(
      { headers: { authorization: 'Bearer token' } } as AuthenticatedRequest,
      mockResponse(),
      next
    );

    expect(next).toHaveBeenCalledWith(failure);
  });
});

describe('currentUser', () => {
  it('returns the attached identity', () => {
    const identity = makeIdentity();
    expect(currentUser({ user: identity } as AuthenticatedRequest)).toBe(identity);
  });

  it('throws a 401 when no identity is attached', () => {
    expect(() => currentUser({} as AuthenticatedRequest)).toThrow('Unauthorized');
  });
});

describe('requireAdmin', () => {
  it('passes admins through', () => {
    const next = jest.fn();

    requireAdmin(
      { user: makeIdentity({ roles: ['customer', 'admin'], is_admin: true }) } as AuthenticatedRequest,
      mockResponse(),
      next
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('responds 401 when unauthenticated', () => {
    const res = mockResponse();

    requireAdmin({} as AuthenticatedRequest, res, jest.fn());

    expect(res.statusCode).toBe(401);
  });

  it('responds 403 when the caller lacks the admin role', () => {
    const res = mockResponse();
    const next = jest.fn();

    requireAdmin({ user: makeIdentity() } as AuthenticatedRequest, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'admin privileges required' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireSeller', () => {
  it('passes active sellers through', () => {
    const next = jest.fn();

    requireSeller(
      {
        user: makeIdentity({ roles: ['customer', 'seller'], is_seller: true, seller_id: 4, seller_status: 'active' })
      } as AuthenticatedRequest,
      mockResponse(),
      next
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('responds 401 when unauthenticated', () => {
    const res = mockResponse();

    requireSeller({} as AuthenticatedRequest, res, jest.fn());

    expect(res.statusCode).toBe(401);
  });

  it('responds 403 when the caller has no seller account', () => {
    const res = mockResponse();

    requireSeller({ user: makeIdentity() } as AuthenticatedRequest, res, jest.fn());

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Seller account required' });
  });

  it('reports the seller status when the account is not active yet', () => {
    const res = mockResponse();

    requireSeller(
      { user: makeIdentity({ seller_id: 4, seller_status: 'pending' }) } as AuthenticatedRequest,
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Seller account is pending' });
  });
});
