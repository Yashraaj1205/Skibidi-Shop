import express, { NextFunction, Response } from 'express';
import request from 'supertest';
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

import storeRouter from '../../src/api/store';

const app = express();
app.use(express.json());
app.use('/api/store', storeRouter);

beforeEach(() => {
  injectedUser = {
    firebase_uid: 'uid-1',
    email: 'ada@example.com',
    display_name: 'Ada',
  };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/store/orders', () => {
  it('creates an order from the caller profile and the product catalog', async () => {
    query
      .mockResolvedValueOnce(queryResult([{ id: 5, display_name: 'Ada', email: 'ada@example.com' }]))
      .mockResolvedValueOnce(queryResult([{ name: 'PS5', price: '499.99' }]))
      .mockResolvedValueOnce(queryResult([{ id: 42, status: 'pending' }]));

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 42, status: 'pending' });
    expect(query.mock.calls[0][1]).toEqual(['uid-1']);
    expect(query.mock.calls[1][1]).toEqual([3]);
    expect(query.mock.calls[2][1]).toEqual(['Ada', 'ada@example.com', 5, 'PS5']);
  });

  it('returns 401 when the request has no user', async () => {
    injectedUser = undefined;

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when product_id is missing', async () => {
    const res = await request(app).post('/api/store/orders').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'product_id is required' });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when the profile has not been synced', async () => {
    query.mockResolvedValueOnce(queryResult([], 0));

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Profile not synced' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the product is missing or out of stock', async () => {
    query
      .mockResolvedValueOnce(queryResult([{ id: 5, display_name: 'Ada', email: 'ada@example.com' }]))
      .mockResolvedValueOnce(queryResult([], 0));

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found or out of stock' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when a query fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/store/my-orders', () => {
  it('returns the caller orders', async () => {
    const rows = [{ id: 2 }, { id: 1 }];
    query.mockResolvedValue(queryResult(rows));

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual(['uid-1']);
  });

  it('returns 401 when the request has no user', async () => {
    injectedUser = undefined;

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 500 when the query fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(500);
  });
});
