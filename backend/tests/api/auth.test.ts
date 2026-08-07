import request from 'supertest';
import { appWith, authState, mockAuthModule } from '../helpers/authState';
import { makeIdentity } from '../helpers/fixtures';

jest.mock('../../src/middleware/auth', () => jest.requireActual('../helpers/authState').mockAuthModule());

import authRouter from '../../src/api/auth';

const app = appWith('/api/auth', authRouter);

beforeEach(() => {
  authState.identity = makeIdentity();
});

describe('/api/auth', () => {
  it('rejects unauthenticated callers', async () => {
    authState.identity = null;

    await expect(request(app).get('/api/auth/me').then((res) => res.status)).resolves.toBe(401);
    await expect(request(app).post('/api/auth/sync').then((res) => res.status)).resolves.toBe(401);
  });

  it('reports the profile resolved during authentication', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 7,
      firebase_uid: 'uid-7',
      email: 'ada@example.com',
      display_name: 'Ada',
      photo_url: null,
      roles: ['customer'],
      is_admin: false,
      is_seller: false,
      seller_id: null,
      seller_status: null
    });
  });

  it('exposes server-derived roles rather than anything the client claims', async () => {
    authState.identity = makeIdentity({
      roles: ['customer', 'admin', 'seller'],
      is_admin: true,
      is_seller: true,
      seller_id: 4,
      seller_status: 'active',
      photo_url: 'https://x/y.png'
    });

    const res = await request(app).post('/api/auth/sync').send({ is_admin: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      roles: ['customer', 'admin', 'seller'],
      is_admin: true,
      is_seller: true,
      seller_id: 4,
      seller_status: 'active',
      photo_url: 'https://x/y.png'
    });
  });
});

describe('mockAuthModule', () => {
  it('keeps the real authorization middleware', () => {
    expect(typeof mockAuthModule().requireAdmin).toBe('function');
  });
});
