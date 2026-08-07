import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import authRoutes from './api/auth';
import orderRoutes from './api/orders';
import productRoutes from './api/products';
import storeRoutes from './api/store';
import { isFirebaseReady } from './config/firebase';
import { errorHandler } from './middleware/error';

const CLIENT_DIR = path.join(__dirname, '../../client');

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function firebaseWebConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
}

export function createApp(): Express {
  const app = express();
  const origins = allowedOrigins();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(cors(origins.length > 0 ? { origin: origins, credentials: true } : {}));
  app.use(express.json({ limit: '100kb' }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests' }
    })
  );

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', firebase: isFirebaseReady() });
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(firebaseWebConfig());
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/store', storeRoutes);
  app.use('/api/orders', orderRoutes);

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(express.static(CLIENT_DIR));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}
