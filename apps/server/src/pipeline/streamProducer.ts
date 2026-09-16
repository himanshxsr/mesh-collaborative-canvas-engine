import { cmdClient } from '../config/redis.js';

export async function appendStreamDelta(roomId: string, binaryDelta: Uint8Array | Buffer): Promise<string> {
  const streamKey = `canvas:room:${roomId}:stream`;
  const base64Data = Buffer.from(binaryDelta).toString('base64');
  
  try {
    const messageId = await cmdClient.xadd(streamKey, 'MAXLEN', '~', '5000', '*', 'delta', base64Data);
    if (!messageId) {
      throw new Error(`[StreamProducer] Failed to append delta, xadd returned null for ${streamKey}`);
    }
    return messageId;
  } catch (err) {
    console.error(`[StreamProducer] Failed to append delta to stream ${streamKey}:`, err);
    throw err;
  }
}

export async function updateRoomActivity(roomId: string): Promise<void> {
  const metaKey = `canvas:room:${roomId}:meta`;
  const now = Date.now().toString();
  
  try {
    await cmdClient.hset(metaKey, {
      lastActive: now
    });
    await cmdClient.hincrby(metaKey, 'totalDeltas', 1);
  } catch (err) {
    console.error(`[StreamProducer] Failed to update room activity for ${metaKey}:`, err);
  }
}

export async function updateConnectionCount(roomId: string, delta: number): Promise<number> {
  const metaKey = `canvas:room:${roomId}:meta`;
  
  try {
    const newCount = await cmdClient.hincrby(metaKey, 'activeConnections', delta);
    if (newCount < 0) {
      await cmdClient.hset(metaKey, 'activeConnections', '0');
      return 0;
    }
    return newCount;
  } catch (err) {
    console.error(`[StreamProducer] Failed to update connection count for ${metaKey}:`, err);
    return 0;
  }
}

export async function updatePresenceHash(
  roomId: string,
  clientId: string,
  presenceJson: string,
  ttlSeconds: number = 10
): Promise<void> {
  const presenceKey = `canvas:room:${roomId}:presence`;
  
  try {
    await cmdClient.hset(presenceKey, clientId, presenceJson);
    await cmdClient.expire(presenceKey, ttlSeconds);
  } catch (err) {
    console.error(`[StreamProducer] Failed to update presence hash for ${presenceKey}:`, err);
  }
}

export async function removePresenceFromHash(roomId: string, clientId: string): Promise<void> {
  const presenceKey = `canvas:room:${roomId}:presence`;
  
  try {
    await cmdClient.hdel(presenceKey, clientId);
  } catch (err) {
    console.error(`[StreamProducer] Failed to remove presence for ${presenceKey}:`, err);
  }
}
