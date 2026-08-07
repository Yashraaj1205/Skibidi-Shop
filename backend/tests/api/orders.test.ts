import express from 'express';
import request from 'supertest';
import { queryResult } from '../helpers/mockPool';

const query = jest.fn();
jest.mock('../../src/db/pool', () => ({ pool: { query } }));

import ordersRouter from '../../src/api/orders';

const app = express();
app.use(express.json());
app.use('/api/orders', ordersRouter);

describe('GET /api/orders', () => {
  it('returns all orders newest first', async () => {
    const rows = [{ id: 2 }, { id: 1 }];
    query.mockResolvedValue(queryResult(rows));

    const res = await request(app).get('/api/orders');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(query).toHaveBeenCalledWith('SELECT * FROM orders ORDER BY id DESC');
  });

  it('returns 500 when the query fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/orders');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/orders', () => {
  it('rejects a payload missing customer_name', async () => {
    const res = await request(app).post('/api/orders').send({ product_name: 'PS5' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'customer_name and product_name required' });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a payload missing product_name', async () => {
    const res = await request(app).post('/api/orders').send({ customer_name: 'Ada' });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('defaults status to pending and customer_email to null', async () => {
    query.mockResolvedValue(queryResult([{ id: 7 }]));

    const res = await request(app)
      .post('/api/orders')
      .send({ customer_name: 'Ada', product_name: 'PS5' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7 });
    expect(query.mock.calls[0][1]).toEqual(['Ada', null, 'PS5', 'pending']);
  });

  it('passes through an explicit status and email', async () => {
    query.mockResolvedValue(queryResult([{ id: 8 }]));

    await request(app).post('/api/orders').send({
      customer_name: 'Ada',
      product_name: 'PS5',
      status: 'shipped',
      customer_email: 'ada@example.com',
    });

    expect(query.mock.calls[0][1]).toEqual(['Ada', 'ada@example.com', 'PS5', 'shipped']);
  });

  it('returns 500 when the insert fails', async () => {
    query.mockRejectedValue(new Error('constraint'));

    const res = await request(app)
      .post('/api/orders')
      .send({ customer_name: 'Ada', product_name: 'PS5' });

    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/orders/:id', () => {
  it('rejects an unknown status', async () => {
    const res = await request(app).patch('/api/orders/1').send({ status: 'lost' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'status must be: pending, shipped, delivered' });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a missing status', async () => {
    const res = await request(app).patch('/api/orders/1').send({});

    expect(res.status).toBe(400);
  });

  it('updates the order and returns the new row', async () => {
    query.mockResolvedValue(queryResult([{ id: 1, status: 'shipped' }]));

    const res = await request(app).patch('/api/orders/1').send({ status: 'shipped' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, status: 'shipped' });
    expect(query.mock.calls[0][1]).toEqual(['shipped', '1']);
  });

  it('returns 404 when no row matched', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).patch('/api/orders/999').send({ status: 'delivered' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('returns 500 when the update fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).patch('/api/orders/1').send({ status: 'delivered' });

    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/orders/:id', () => {
  it('returns the deleted row', async () => {
    query.mockResolvedValue(queryResult([{ id: 3 }]));

    const res = await request(app).delete('/api/orders/3');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: { id: 3 } });
    expect(query).toHaveBeenCalledWith('DELETE FROM orders WHERE id = $1 RETURNING *', ['3']);
  });

  it('returns 404 when the order does not exist', async () => {
    query.mockResolvedValue(queryResult([], 0));

    const res = await request(app).delete('/api/orders/3');

    expect(res.status).toBe(404);
  });

  it('returns 500 when the delete fails', async () => {
    query.mockRejectedValue(new Error('db down'));

    const res = await request(app).delete('/api/orders/3');

    expect(res.status).toBe(500);
  });
});
