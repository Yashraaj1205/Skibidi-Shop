import request from 'supertest';

const query = jest.fn();
jest.mock('../src/db/pool', () => ({ pool: { query, connect: jest.fn() } }));

const isFirebaseReady = jest.fn(() => true);
jest.mock('../src/config/firebase', () => ({
  isFirebaseReady,
  getAuth: () => ({ verifyIdToken: jest.fn().mockRejectedValue(new Error('invalid')) }),
}));

import { allowedOrigins, createApp } from '../src/app';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.CORS_ORIGINS;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('FIREBASE_')) delete process.env[key];
  }
});

afterEach(() => {
  process.env = originalEnv;
});

describe('allowedOrigins', () => {
  it('is empty when CORS_ORIGINS is unset', () => {
    expect(allowedOrigins()).toEqual([]);
  });

  it('splits and trims the configured origins', () => {
    process.env.CORS_ORIGINS = 'https://shop.example , https://admin.example';

    expect(allowedOrigins()).toEqual(['https://shop.example', 'https://admin.example']);
  });
});

describe('GET /healthz', () => {
  it('reports process and Firebase readiness', async () => {
    const res = await request(createApp()).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', firebase: true });
  });

  it('reports Firebase as unavailable when it failed to initialize', async () => {
    isFirebaseReady.mockReturnValueOnce(false);

    const res = await request(createApp()).get('/healthz');

    expect(res.body.firebase).toBe(false);
  });
});

describe('GET /api/config', () => {
  it('returns the Firebase web config from the environment', async () => {
    process.env.FIREBASE_API_KEY = 'key';
    process.env.FIREBASE_AUTH_DOMAIN = 'domain';
    process.env.FIREBASE_PROJECT_ID = 'project';
    process.env.FIREBASE_STORAGE_BUCKET = 'bucket';
    process.env.FIREBASE_MESSAGING_SENDER_ID = 'sender';
    process.env.FIREBASE_APP_ID = 'app';

    const res = await request(createApp()).get('/api/config');

    expect(res.body).toEqual({
      apiKey: 'key',
      authDomain: 'domain',
      projectId: 'project',
      storageBucket: 'bucket',
      messagingSenderId: 'sender',
      appId: 'app',
    });
  });

  it('falls back to empty strings when unconfigured', async () => {
    const res = await request(createApp()).get('/api/config');

    expect(res.body.apiKey).toBe('');
  });
});

describe('security middleware', () => {
  it('sets helmet response headers', async () => {
    const res = await request(createApp()).get('/healthz');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('reflects only allowlisted CORS origins', async () => {
    process.env.CORS_ORIGINS = 'https://shop.example';
    const app = createApp();

    const allowed = await request(app).get('/healthz').set('Origin', 'https://shop.example');
    const denied = await request(app).get('/healthz').set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('https://shop.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits API traffic', async () => {
    const app = createApp();
    let lastStatus = 200;

    for (let i = 0; i < 125 && lastStatus !== 429; i += 1) {
      lastStatus = (await request(app).get('/api/nope')).status;
    }

    expect(lastStatus).toBe(429);
  });
});

describe('API routing', () => {
  it('mounts the order routes behind authentication', async () => {
    const res = await request(createApp()).get('/api/orders');

    expect(res.status).toBe(401);
  });

  it('returns JSON (not HTML) for unknown API routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('serves the storefront for unknown non-API routes', async () => {
    const res = await request(createApp()).get('/some/deep/link');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
  });
});
