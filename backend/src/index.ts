import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { runMigrations } from './db/migrate';
import { startDBListener } from './db/listener';
import { createWebSocketServer } from './ws/server';
import authRoutes from './api/auth';
import productRoutes from './api/products';
import storeRoutes from './api/store';
import orderRoutes from './api/orders';

const PORT = process.env.PORT || 3000;

async function main() {
  await runMigrations();
  await startDBListener();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../client')));

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/store', storeRoutes);
  app.use('/api/orders', orderRoutes);

  app.get('/api/config', (_req, res) => {
    res.json({
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.FIREBASE_APP_ID || ""
    });
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../client/index.html'));
  });

  const server = http.createServer(app);
  createWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`\nServer  → http://localhost:${PORT}`);
    console.log(`WS      → ws://localhost:${PORT}`);
    console.log(`API     → http://localhost:${PORT}/api\n`);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
