import { redisClient } from '../config/db.js';
import { fetchLatestSnapshot, saveSnapshotTransaction } from '../persistence/snapshotRepository.js';
import { compileYDocState } from '../compactor/yjsCompactor.js';

const GROUP_NAME = 'snapshot_workers';
const CONSUMER_ID = `worker_${process.pid}`;

export async function processRoomStreamBatch(roomId: string): Promise<number> {
  const streamKey = `canvas:room:${roomId}:stream`;

  try {
    await redisClient.xgroup('CREATE', streamKey, GROUP_NAME, '0', 'MKSTREAM');
  } catch (_err) {
    // Group already exists
  }

  try {
    const entries = await redisClient.xreadgroup(
      'GROUP', GROUP_NAME, CONSUMER_ID,
      'COUNT', 100,
      'BLOCK', 500,
      'STREAMS', streamKey, '>'
    );

    if (!entries || entries.length === 0) {
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

    const latestSnapshot = await fetchLatestSnapshot(roomId);
    const nextIndex = latestSnapshot ? latestSnapshot.snapshotIndex + 1 : 1;
    const baselineState = latestSnapshot ? latestSnapshot.documentState : null;

    const { compiledState, elementsJson, vectorClock } = compileYDocState(baselineState, deltas);

    await saveSnapshotTransaction(
      roomId,
      nextIndex,
      compiledState,
      elementsJson,
      vectorClock
    );

    await redisClient.xack(streamKey, GROUP_NAME, ...messageIds);
    const lastMsgId = messageIds[messageIds.length - 1];
    await redisClient.xtrim(streamKey, 'MINID', lastMsgId);

    console.log(`[StreamConsumer] Compacted ${deltas.length} deltas for room ${roomId} (snapshot_index: ${nextIndex})`);
    return deltas.length;
  } catch (err) {
    console.error(`[StreamConsumer] Error processing stream batch for room ${roomId}:`, err);
    throw err;
  }
}
