import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-key.json';
const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(__dirname, '../../', keyPath);

let app: admin.app.App | null = null;

export function initializeFirebase(): admin.app.App {
  if (app) return app;

  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    throw new Error(
      `Unable to read Firebase service account key at ${resolved}: ${(err as Error).message}. ` +
        'Set FIREBASE_SERVICE_ACCOUNT_PATH or place firebase-service-key.json in the backend root.'
    );
  }

  let serviceAccount: admin.ServiceAccount & { private_key?: string };
  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Firebase service account key at ${resolved} is not valid JSON: ${(err as Error).message}`);
  }

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('Firebase Admin initialized');
  return app;
}

export function getAuth(): admin.auth.Auth {
  if (!app) {
    throw new Error('Firebase Admin has not been initialized');
  }
  return app.auth();
}
