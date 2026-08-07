import express from 'express';
import request from 'supertest';
import { NextFunction, Response } from 'express';
import { queryResult } from '../helpers/mockPool';
import type { AuthenticatedRequest } from '../../src/middleware/auth';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));

let injectedUser: AuthenticatedRequest['user'];
jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.user = injectedUser;
    next();
  },
}));

import authRouter from '../../src/api/auth';
import { errorHandler } from '../../src/middleware/error';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use(errorHandler);

const user = {
  firebase_uid: 'uid-1',
  email: 'ada@example.com',
  display_name: 'Ada',
  photo_url: 'https://cdn/a.png',
  is_admin: false,
};

beforeEach(() => {
  injectedUser = user;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/auth/sync', () => {
  it('upserts the profile and returns the stored row', async () => {
    query.mockResolvedValue(queryResult([{ id: 1, ...user }]));

    const res = await request(app).post('/api/auth/sync').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, ...user });
    expect(query.mock.calls[0][0]).not.toContain('is_admin');
    expect(query.mock.calls[0][1]).toEqual([
      'uid-1',
      'ada@example.com',
      'Ada',
      'https://cdn/a.png',
    ]);
  });

  it('reports the server-side admin verdict rather than trusting the client', async () => {
    injectedUser = { ...user, email: 'owner@example.com', is_admin: true };
    query.mockResolvedValue(queryResult([{ id: 1, is_admin: false }]));

    const res = await request(app).post('/api/auth/sync').send({});

    expect(res.body.is_admin).toBe(true);
  });

  it('returns 401 when the request has no user', async () => {
    injectedUser = undefined;

    const res = await request(app).post('/api/auth/sync').send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 500 when the upsert fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).post('/api/auth/sync').send({});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/auth/me', () => {
  it('returns the stored profile with the admin flag', async () => {
    injectedUser = { ...user, is_admin: true };
    query.mockResolvedValue(queryResult([{ id: 1, ...user }]));

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, ...user, is_admin: true });
    expect(query).toHaveBeenCalledWith('SELECT * FROM users WHERE firebase_uid = $1', ['uid-1']);
  });

  it('returns 404 when the profile has not been synced', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('returns 401 when the request has no user', async () => {
    injectedUser = undefined;

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('returns 500 when the lookup fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(500);
  });
});
