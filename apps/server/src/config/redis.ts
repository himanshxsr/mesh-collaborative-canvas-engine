import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 10) {
      return null;
    }
    return Math.min(times * 100, 3000);
  }
};

export const pubClient = new Redis(REDIS_URL, redisOptions);
export const subClient = pubClient.duplicate();
export const cmdClient = pubClient.duplicate();

pubClient.on('error', (err: Error) => {
  console.error('[Redis pubClient Error]', err.message);
});

subClient.on('error', (err: Error) => {
  console.error('[Redis subClient Error]', err.message);
});

cmdClient.on('error', (err: Error) => {
  console.error('[Redis cmdClient Error]', err.message);
});

export async function closeRedisConnections(): Promise<void> {
  try {
    await Promise.all([
      pubClient.quit(),
      subClient.quit(),
      cmdClient.quit()
    ]);
  } catch (err) {
    console.error('[Redis] Error during shutdown:', err);
  }
}
