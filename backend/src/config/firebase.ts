import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-key.json';
const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(__dirname, '../../', keyPath);

try {
  const raw = fs.readFileSync(resolved, 'utf8');
  const sa = JSON.parse(raw);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  console.log('Firebase Admin initialized');
} catch (err) {
  console.error('Firebase init failed:', err);
  process.exit(1);
}

export const auth = admin.auth();
export default admin;
