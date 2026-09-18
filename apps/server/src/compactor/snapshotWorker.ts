import pg from 'pg';
import type { Redis } from 'ioredis';
import * as Y from 'yjs';

const { Pool } = pg;

export interface SnapshotWorkerController {
  pool: pg.Pool;
  stopWorker: () => Promise<void>;
}

export interface LatestSnapshotRecord {
  documentState: Buffer;
  snapshotIndex: number;
}

export interface CompactedStateResult {
  compiledState: Buffer;
  elementsJson: Record<string, unknown>;
  vectorClock: string;
}

export function compileYDocState(
  baselineState: Uint8Array | Buffer | null,
  deltas: Array<Uint8Array | Buffer>
): CompactedStateResult {
  const doc = new Y.Doc();

  if (baselineState && baselineState.length > 0) {
    Y.applyUpdate(doc, new Uint8Array(baselineState));
  }

  for (const delta of deltas) {
    if (delta && delta.length > 0) {
      Y.applyUpdate(doc, new Uint8Array(delta));
    }
  }

  const compiledState = Buffer.from(Y.encodeStateAsUpdate(doc));
  const elementsMap = doc.getMap('canvas:elements');
  const elementsJson = elementsMap.toJSON() as Record<string, unknown>;

  const vectorClockArray = Array.from(Y.encodeStateVector(doc));
  const vectorClock = JSON.stringify(vectorClockArray);

  return {
    compiledState,
    elementsJson,
    vectorClock
  };
}

async function fetchLatestSnapshot(pool: pg.Pool, roomId: string): Promise<LatestSnapshotRecord | null> {
  const query = `
    SELECT document_state, snapshot_index
    FROM canvas_snapshots
    WHERE room_id = $1
    ORDER BY snapshot_index DESC
    LIMIT 1
  `;

  const client = await pool.connect();
  try {
    const res = await client.query<{ document_state: Buffer; snapshot_index: string }>(query, [roomId]);
    if (res.rowCount && res.rowCount > 0) {
      const row = res.rows[0];
      return {
        documentState: row.document_state,
        snapshotIndex: Number(row.snapshot_index)
      };
    }
    return null;
  } catch (err) {
    console.error(`[Server SnapshotWorker] Error fetching latest snapshot for room ${roomId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function saveSnapshotTransaction(
  pool: pg.Pool,
  roomId: string,
  snapshotIndex: number,
  documentState: Buffer,
  elementsJson: Record<string, unknown>,
  vectorClock: string
): Promise<void> {
  const insertQuery = `
    INSERT INTO canvas_snapshots
      (room_id, snapshot_index, document_state, elements_json, vector_clock)
    VALUES ($1, $2, $3, $4, $5)
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(insertQuery, [
      roomId,
      snapshotIndex,
      documentState,
      JSON.stringify(elementsJson),
      vectorClock
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Server SnapshotWorker] Transaction rolled back for room ${roomId}, index ${snapshotIndex}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

const GROUP_NAME = 'snapshot_workers';
const CONSUMER_ID = `server_worker_${process.pid}`;

async function processRoomStreamBatch(pool: pg.Pool, redisClient: Redis, roomId: string): Promise<number> {
  const streamKey = `canvas:room:${roomId}:stream`;

  try {
    await redisClient.xgroup('CREATE', streamKey, GROUP_NAME, '0', 'MKSTREAM');
  } catch (_err) {
    // Consumer group already exists
  }

  try {
    const entries = await redisClient.xreadgroup(
      'GROUP', GROUP_NAME, CONSUMER_ID,
      'COUNT', 100,
      'BLOCK', 500,
      'STREAMS', streamKey, '>'
    );

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return 0;
    }

    const streamTuples = entries as Array<[string, Array<[string, string[]]>]>;
    if (!streamTuples[0] || !streamTuples[0][1] || streamTuples[0][1].length === 0) {
      return 0;
    }

    const messages = streamTuples[0][1];
    const messageIds: string[] = [];
    const deltas: Buffer[] = [];

    for (const [msgId, fields] of messages) {
      messageIds.push(msgId);
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === 'delta' && fields[i + 1]) {
          const deltaBuffer = Buffer.from(fields[i + 1], 'base64');
          deltas.push(deltaBuffer);
        }
      }
    }

    if (deltas.length === 0) {
      if (messageIds.length > 0) {
        await redisClient.xack(streamKey, GROUP_NAME, ...messageIds);
      }
      return 0;
    }

    const latestSnapshot = await fetchLatestSnapshot(pool, roomId);
    const nextIndex = latestSnapshot ? latestSnapshot.snapshotIndex + 1 : 1;
    const baselineState = latestSnapshot ? latestSnapshot.documentState : null;

    const { compiledState, elementsJson, vectorClock } = compileYDocState(baselineState, deltas);

    await saveSnapshotTransaction(
      pool,
      roomId,
      nextIndex,
      compiledState,
      elementsJson,
      vectorClock
    );

    await redisClient.xack(streamKey, GROUP_NAME, ...messageIds);
    const lastMsgId = messageIds[messageIds.length - 1];
    await redisClient.xtrim(streamKey, 'MINID', lastMsgId);

    console.log(`[Server SnapshotWorker] Compacted ${deltas.length} deltas for room ${roomId} (snapshot_index: ${nextIndex})`);
    return deltas.length;
  } catch (err) {
    console.error(`[Server SnapshotWorker] Error processing stream batch for room ${roomId}:`, err);
    throw err;
  }
}

async function discoverActiveRooms(redisClient: Redis): Promise<string[]> {
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
    console.error('[Server SnapshotWorker] Error discovering active room streams from Redis:', err);
    return [];
  }
}

export function startSnapshotWorker(
  databaseUrl: string,
  redisClient: Redis,
  pollIntervalMs = 5000
): SnapshotWorkerController {
  let isRunning = true;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  pool.on('error', (err: Error) => {
    console.error('[Server PostgreSQL Pool Error]', err.message);
  });

  const workerLoop = async () => {
    console.log(`[Server SnapshotWorker] Compactor loop started (polling every ${pollIntervalMs}ms)`);

    while (isRunning) {
      try {
        const activeRoomIds = await discoverActiveRooms(redisClient);
        for (const roomId of activeRoomIds) {
          if (!isRunning) break;
          try {
            await processRoomStreamBatch(pool, redisClient, roomId);
          } catch (err) {
            console.error(`[Server SnapshotWorker] Error processing room ${roomId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Server SnapshotWorker] Error in compaction loop iteration:', err);
      }

      if (isRunning) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    console.log('[Server SnapshotWorker] Compaction loop stopped.');
  };

  workerLoop().catch((err) => {
    console.error('[Server SnapshotWorker] Fatal error in worker loop:', err);
  });

  const stopWorker = async (): Promise<void> => {
    isRunning = false;
    try {
      await pool.end();
      console.log('[Server SnapshotWorker] PostgreSQL connection pool cleanly closed.');
    } catch (err) {
      console.error('[Server SnapshotWorker] Error closing PostgreSQL pool:', err);
    }
  };

  return {
    pool,
    stopWorker
  };
}
