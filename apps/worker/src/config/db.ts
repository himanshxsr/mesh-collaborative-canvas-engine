import pg from 'pg';
import { Redis } from 'ioredis';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://mesh_user:mesh_password@127.0.0.1:5432/mesh_canvas';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const pgPool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pgPool.on('error', (err: Error) => {
  console.error('[Worker PostgreSQL Pool Error]', err.message);
});

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 10) return null;
    return Math.min(times * 100, 3000);
  }
});

redisClient.on('error', (err: Error) => {
  console.error('[Worker Redis Error]', err.message);
});

export async function closeWorkerConnections(): Promise<void> {
  try {
    await Promise.all([
      pgPool.end(),
      redisClient.quit()
    ]);
    console.log('[Worker] Cleanly closed PostgreSQL pool and Redis client connections.');
  } catch (err) {
    console.error('[Worker] Error closing database connections:', err);
  }
}
