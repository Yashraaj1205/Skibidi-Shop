import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../src/middleware/validate';

const app = express();
app.use(express.json());

app.post(
  '/body',
  validateBody(z.object({ name: z.string().min(1), qty: z.coerce.number().int().default(1) })),
  (req, res) => { res.json(req.body); }
);

app.get(
  '/params/:id',
  validateParams(z.object({ id: z.coerce.number().int().positive() })),
  (req, res) => { res.json(req.params); }
);

app.get(
  '/query',
  validateQuery(z.object({ page: z.coerce.number().int().min(1).default(1) })),
  (req, res) => { res.json(req.query); }
);

describe('validateBody', () => {
  it('replaces the body with the parsed and defaulted value', async () => {
    const res = await request(app).post('/body').send({ name: 'PS5', qty: '3' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'PS5', qty: 3 });
  });

  it('applies schema defaults for omitted fields', async () => {
    const res = await request(app).post('/body').send({ name: 'PS5' });

    expect(res.body).toEqual({ name: 'PS5', qty: 1 });
  });

  it('rejects an invalid body with per-field details', async () => {
    const res = await request(app).post('/body').send({ qty: 'many' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['name', 'qty']));
  });

  it('reports a non-object body under the "body" key', async () => {
    const res = await request(app).post('/body').set('Content-Type', 'application/json').send('[]');

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('body');
  });
});

describe('validateParams', () => {
  it('coerces valid params', async () => {
    const res = await request(app).get('/params/42');

    expect(res.body).toEqual({ id: 42 });
  });

  it('rejects a non-numeric id', async () => {
    const res = await request(app).get('/params/abc');

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('id');
  });
});

describe('validateQuery', () => {
  it('defaults a missing page', async () => {
    const res = await request(app).get('/query');

    expect(res.body).toEqual({ page: 1 });
  });

  it('rejects an out-of-range page', async () => {
    const res = await request(app).get('/query?page=0');

    expect(res.status).toBe(400);
  });
});
