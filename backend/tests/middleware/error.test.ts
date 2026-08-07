import express from 'express';
import request from 'supertest';
import { asyncHandler } from '../../src/lib/asyncHandler';
import { HttpError, errorHandler, notFoundHandler } from '../../src/middleware/error';

const app = express();

app.get('/http-error', asyncHandler(async () => { throw new HttpError(409, 'Already shipped'); }));
app.get('/boom', asyncHandler(async () => { throw new Error('kaboom'); }));
app.get('/sync-boom', () => { throw new Error('sync kaboom'); });
app.get('/ok', asyncHandler(async (_req, res) => { res.json({ ok: true }); }));
app.use(notFoundHandler);
app.use(errorHandler);

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('errorHandler', () => {
  it('maps HttpError to its own status and message', async () => {
    const res = await request(app).get('/http-error');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Already shipped' });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('hides unexpected async errors behind a 500 and logs them', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith('Unhandled request error:', expect.any(Error));
  });

  it('also catches synchronous throws', async () => {
    const res = await request(app).get('/sync-boom');

    expect(res.status).toBe(500);
  });

  it('leaves successful responses alone', async () => {
    const res = await request(app).get('/ok');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('notFoundHandler', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
