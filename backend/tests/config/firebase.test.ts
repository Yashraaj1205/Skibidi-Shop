import path from 'path';

const initializeApp = jest.fn();
const cert = jest.fn((sa: unknown) => ({ sa }));
const authInstance = { verifyIdToken: jest.fn() };
const authFn = jest.fn(() => authInstance);
jest.mock('firebase-admin', () => ({
  initializeApp,
  credential: { cert },
  auth: authFn,
}));

const readFileSync = jest.fn();
jest.mock('fs', () => ({ readFileSync }));

type FirebaseModule = typeof import('../../src/config/firebase');

function loadFirebase(): FirebaseModule {
  let mod: FirebaseModule;
  jest.isolateModules(() => {
    mod = require('../../src/config/firebase');
  });
  return mod!;
}

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = originalEnv;
});

describe('firebase config', () => {
  it('initializes the admin app with the service account and un-escapes the private key', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/key.json';
    readFileSync.mockReturnValue(
      JSON.stringify({ project_id: 'p', private_key: 'line1\\nline2' })
    );

    const mod = loadFirebase();

    expect(readFileSync).toHaveBeenCalledWith('/abs/key.json', 'utf8');
    expect(cert).toHaveBeenCalledWith({ project_id: 'p', private_key: 'line1\nline2' });
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(mod.isFirebaseReady()).toBe(true);
    expect(mod.getAuth()).toBe(authInstance);
  });

  it('resolves a relative key path against the backend root', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = 'secrets/key.json';
    readFileSync.mockReturnValue(JSON.stringify({ project_id: 'p' }));

    loadFirebase();

    const [resolved] = readFileSync.mock.calls[0];
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved.endsWith(path.join('secrets', 'key.json'))).toBe(true);
  });

  it('defaults to firebase-service-key.json in the backend root', () => {
    readFileSync.mockReturnValue(JSON.stringify({ project_id: 'p' }));

    loadFirebase();

    const [resolved] = readFileSync.mock.calls[0];
    expect(resolved.endsWith('firebase-service-key.json')).toBe(true);
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  it('keeps the service account untouched when there is no private_key', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/key.json';
    readFileSync.mockReturnValue(JSON.stringify({ project_id: 'p' }));

    loadFirebase();

    expect(cert).toHaveBeenCalledWith({ project_id: 'p' });
  });

  it('loads without throwing when the key file is missing, and reports not ready', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/missing.json';
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const mod = loadFirebase();

    expect(initializeApp).not.toHaveBeenCalled();
    expect(mod.isFirebaseReady()).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Firebase init failed:', expect.any(Error));
  });

  it('throws from getAuth instead of at import time when uninitialized', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/key.json';
    readFileSync.mockReturnValue('not json');

    const mod = loadFirebase();

    expect(authFn).not.toHaveBeenCalled();
    expect(() => mod.getAuth()).toThrow('Firebase Admin is not initialized');
  });
});
