import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { startDBListener } from './db/listener';
import { runMigrations } from './db/migrate';
import { pool } from './db/pool';
import { createWebSocketServer } from './ws/server';

const PORT = process.env.PORT || 3000;

async function main() {
  await runMigrations();
  await startDBListener();

  const server = http.createServer(createApp());
  createWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`\nServer  → http://localhost:${PORT}`);
    console.log(`WS      → ws://localhost:${PORT}`);
    console.log(`API     → http://localhost:${PORT}/api\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
