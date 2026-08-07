import express from 'express';
import request from 'supertest';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));

import productsRouter from '../../src/api/products';

const app = express();
app.use('/api/products', productsRouter);

describe('GET /api/products', () => {
  it('returns only in-stock products ordered by id', async () => {
    const rows = [{ id: 1, name: 'PS5' }];
    query.mockResolvedValue(queryResult(rows));

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query).toHaveBeenCalledWith(
      'SELECT * FROM products WHERE in_stock = TRUE ORDER BY id ASC'
    );
  });

  it('returns 500 when the query fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
