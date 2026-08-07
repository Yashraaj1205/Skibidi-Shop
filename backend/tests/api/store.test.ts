import express, { NextFunction, Response } from 'express';
import request from 'supertest';
import { queryResult } from '../helpers/mockPool';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../src/middleware/auth';

const query = jest.fn();
const clientQuery = jest.fn();
const release = jest.fn();
const connect = jest.fn(async () => ({ query: clientQuery, release }));
jest.mock('../../src/db/pool', () => ({ pool: { query, connect } }));
jest.mock('../../src/config/firebase', () => ({ getAuth: () => ({ verifyIdToken: jest.fn() }) }));

let injectedUser: AuthenticatedUser | undefined;
jest.mock('../../src/middleware/auth', () => ({
  ...jest.requireActual('../../src/middleware/auth'),
  authenticateToken: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.user = injectedUser;
    next();
  },
}));

import storeRouter from '../../src/api/store';
import { errorHandler } from '../../src/middleware/error';

const app = express();
app.use(express.json());
app.use('/api/store', storeRouter);
app.use(errorHandler);

const shopper: AuthenticatedUser = {
  firebase_uid: 'uid-1',
  email: 'ada@example.com',
  display_name: 'Ada',
  is_admin: false,
};

const userRow = { id: 5, display_name: 'Ada', email: 'ada@example.com' };
const productRow = { name: 'PS5', price: '499.99' };

function stubHappyCheckout() {
  clientQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT id, display_name')) return queryResult([userRow]);
    if (sql.startsWith('SELECT name, price')) return queryResult([productRow]);
    if (sql.startsWith('INSERT INTO orders')) return queryResult([{ id: 11, product_name: 'PS5' }]);
    return queryResult([]);
  });
}

beforeEach(() => {
  injectedUser = shopper;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/store/orders', () => {
  it('requires authentication', async () => {
    injectedUser = undefined;

    const res = await request(app).post('/api/store/orders').send({ product_id: 1 });

    expect(res.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a missing product_id', async () => {
    const res = await request(app).post('/api/store/orders').send({});

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('product_id');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a non-positive product_id', async () => {
    const res = await request(app).post('/api/store/orders').send({ product_id: 0 });

    expect(res.status).toBe(400);
  });

  it('creates the order inside a committed transaction and locks the product row', async () => {
    stubHappyCheckout();

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 11, product_name: 'PS5' });

    const sql = clientQuery.mock.calls.map(([text]) => text);
    expect(sql[0]).toBe('BEGIN');
    expect(sql[sql.length - 1]).toBe('COMMIT');
    expect(sql[2]).toContain('FOR UPDATE');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [3]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO orders'), [
      'Ada',
      'ada@example.com',
      5,
      'PS5',
    ]);
    expect(release).toHaveBeenCalled();
  });

  it('rolls back and returns 400 when the profile was never synced', async () => {
    clientQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT id, display_name') ? queryResult([], 0) : queryResult([])
    );

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Profile not synced' });
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('rolls back and returns 404 when the product is missing or out of stock', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id, display_name')) return queryResult([userRow]);
      if (sql.startsWith('SELECT name, price')) return queryResult([], 0);
      return queryResult([]);
    });

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found or out of stock' });
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rolls back and returns 500 when the insert fails', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id, display_name')) return queryResult([userRow]);
      if (sql.startsWith('SELECT name, price')) return queryResult([productRow]);
      if (sql.startsWith('INSERT INTO orders')) throw new Error('constraint');
      return queryResult([]);
    });

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(500);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('still releases the client when the rollback itself fails', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'ROLLBACK') throw new Error('connection lost');
      if (sql.startsWith('SELECT id, display_name')) throw new Error('db down');
      return queryResult([]);
    });

    const res = await request(app).post('/api/store/orders').send({ product_id: 3 });

    expect(res.status).toBe(500);
    expect(release).toHaveBeenCalled();
  });
});

describe('GET /api/store/my-orders', () => {
  it('requires authentication', async () => {
    injectedUser = undefined;

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(401);
  });

  it('returns only the caller\u2019s orders', async () => {
    const rows = [{ id: 2 }, { id: 1 }];
    query.mockResolvedValue(queryResult(rows));

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('u.firebase_uid = $1'), ['uid-1']);
  });

  it('returns 500 when the query fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/store/my-orders');

    expect(res.status).toBe(500);
  });
});
