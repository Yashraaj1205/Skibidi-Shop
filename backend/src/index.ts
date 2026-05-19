import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { runMigrations } from './db/migrate';
import { startDBListener } from './db/listener';
import { createWebSocketServer } from './ws/server';

// Route Imports
import authRoutes from './api/auth';
import productRoutes from './api/products';
import storeRoutes from './api/store';
import orderRoutes from './api/orders';

const PORT = process.env.PORT || 3000;

async function main() {
  // Setup Database Schema & Seed Data
  await runMigrations();

  // Start DB Listener
  await startDBListener();

  // Setup Express App
  const app = express();
  
  // Enable CORS
  app.use(cors());
  app.use(express.json());

  // Serve Store Client (static folder which we will create shortly)
  app.use(express.static(path.join(__dirname, '../../client')));

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/store', storeRoutes);
  app.use('/api/orders', orderRoutes);

  // Serve SPA Fallback (route all unrecognized front-end paths to index.html)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/index.html'));
  });

  const httpServer = http.createServer(app);

  // Setup WebSocket Server for Real-Time Broadcasting
  createWebSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`\n🚀  Server Active  →  http://localhost:${PORT}`);
    console.log(`📡  WebSocket      →  ws://localhost:${PORT}`);
    console.log(`📋  REST Endpoint  →  http://localhost:${PORT}/api\n`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
