import { redisClient, closeWorkerConnections } from './config/db.js';
import { processRoomStreamBatch } from './consumer/streamConsumer.js';

let isRunning = true;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

async function discoverActiveRooms(): Promise<string[]> {
  try {
    const keys = await redisClient.keys('canvas:room:*:stream');
    const roomIds: string[] = [];

    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 3 && parts[2]) {
        roomIds.push(parts[2]);
      }
    }
    return roomIds;
  } catch (err) {
    console.error('[Worker] Error discovering active room streams from Redis:', err);
    return [];
  }
}

async function runWorkerLoop() {
  console.log(`[Worker] Snapshot Compactor Service started. Polling interval: ${POLL_INTERVAL_MS}ms`);

  while (isRunning) {
    try {
      const activeRoomIds = await discoverActiveRooms();

      for (const roomId of activeRoomIds) {
        if (!isRunning) break;
        try {
          await processRoomStreamBatch(roomId);
        } catch (err) {
          console.error(`[Worker] Unhandled error processing room ${roomId}:`, err);
        }
      }
    } catch (err) {
      console.error('[Worker] Error in main compaction loop iteration:', err);
    }

    if (isRunning) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log('[Worker] Compaction loop terminated.');
}

async function gracefulShutdown(signal: string) {
  console.log(`[Worker] Received ${signal}. Initiating graceful shutdown...`);
  isRunning = false;

  try {
    await closeWorkerConnections();
    console.log('[Worker] Graceful shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during worker shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

runWorkerLoop().catch((err) => {
  console.error('[Worker] Fatal error running worker loop:', err);
  process.exit(1);
});
