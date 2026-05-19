import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-key.json';
const absolutePath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.resolve(__dirname, '../../', serviceAccountPath);

try {
  // Read service account file
  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  const serviceAccount = JSON.parse(fileContent);

  // Bulletproof replacement for PEM private key formatting
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✓ Firebase Admin SDK successfully initialized');
} catch (err) {
  console.error('✗ Failed to initialize Firebase Admin SDK:', err);
}

export const auth = admin.auth();
export default admin;
