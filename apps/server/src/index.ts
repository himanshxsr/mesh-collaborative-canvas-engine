import http from 'http';
import express, { Request, Response } from 'express';
import { pubClient, cmdClient, closeRedisConnections } from './config/redis.js';
import { configureSocketGateway } from './gateway/socketGateway.js';
import { startSnapshotWorker, SnapshotWorkerController } from './compactor/snapshotWorker.js';

const app = express();
app.use(express.json());

let workerController: SnapshotWorkerController | null = null;

if (process.env.DATABASE_URL) {
  console.log('[Server] DATABASE_URL detected. Starting embedded PostgreSQL snapshot compactor worker...');
  workerController = startSnapshotWorker(process.env.DATABASE_URL, cmdClient);
}

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/readyz', (_req: Request, res: Response) => {
  const isRedisConnected = pubClient.status === 'ready';
  const isPgReady = !process.env.DATABASE_URL || workerController !== null;

  if (isRedisConnected && isPgReady) {
    res.status(200).json({
      status: 'ready',
      redis: 'connected',
      pg: workerController ? 'active' : 'bypassed'
    });
  } else {
    res.status(503).json({
      status: 'unready',
      redis: pubClient.status,
      pg: workerController ? 'active' : 'uninitialized'
    });
  }
});

const server = http.createServer(app);
const io = configureSocketGateway(server);

const PORT = parseInt(process.env.PORT || '4000', 10);

server.listen(PORT, () => {
  console.log(`[Server] Socket Gateway listening on port ${PORT}`);
});

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

  try {
    if (workerController) {
      console.log('[Server] Stopping snapshot compactor worker loop & closing PostgreSQL pool...');
      await workerController.stopWorker();
    }

    io.emit('room:terminate', 'Server instance is restarting or shutting down');
    await new Promise<void>((resolve) => {
      io.close(() => {
        console.log('[Server] Socket.io server closed.');
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          console.error('[Server] Error closing HTTP server:', err);
          return reject(err);
        }
        console.log('[Server] HTTP server closed.');
        resolve();
      });
    });

    await closeRedisConnections();
    console.log('[Server] Redis connections closed.');
    process.exit(0);
  } catch (err) {
    console.error('[Server] Error during graceful shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { app, server, io };
