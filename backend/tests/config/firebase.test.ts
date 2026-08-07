import path from 'path';

const initializeApp = jest.fn();
const cert = jest.fn((sa: unknown) => ({ sa }));
const authFn = jest.fn(() => ({ verifyIdToken: jest.fn() }));
jest.mock('firebase-admin', () => ({
  initializeApp,
  credential: { cert },
  auth: authFn,
}));

const readFileSync = jest.fn();
jest.mock('fs', () => ({ readFileSync }));

function loadFirebase(): void {
  jest.isolateModules(() => {
    require('../../src/config/firebase');
  });
}

const originalPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (originalPath === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  else process.env.FIREBASE_SERVICE_ACCOUNT_PATH = originalPath;
});

describe('firebase config', () => {
  it('initializes the admin app with the service account and un-escapes the private key', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/key.json';
    readFileSync.mockReturnValue(
      JSON.stringify({ project_id: 'p', private_key: 'line1\\nline2' })
    );

    loadFirebase();

    expect(readFileSync).toHaveBeenCalledWith('/abs/key.json', 'utf8');
    expect(cert).toHaveBeenCalledWith({ project_id: 'p', private_key: 'line1\nline2' });
    expect(initializeApp).toHaveBeenCalledTimes(1);
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
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
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

  it('logs instead of throwing when the key file is missing', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/missing.json';
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => loadFirebase()).not.toThrow();
    expect(initializeApp).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Firebase init failed:', expect.any(Error));
  });

  it('logs instead of throwing when the key file is not valid JSON', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/abs/key.json';
    readFileSync.mockReturnValue('not json');

    expect(() => loadFirebase()).not.toThrow();
    expect(initializeApp).not.toHaveBeenCalled();
  });
});
