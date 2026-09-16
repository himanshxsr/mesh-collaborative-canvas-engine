import { pgPool } from '../config/db.js';

export interface LatestSnapshotRecord {
  documentState: Buffer;
  snapshotIndex: number;
}

export async function fetchLatestSnapshot(roomId: string): Promise<LatestSnapshotRecord | null> {
  const query = `
    SELECT document_state, snapshot_index
    FROM canvas_snapshots
    WHERE room_id = $1
    ORDER BY snapshot_index DESC
    LIMIT 1
  `;

  const client = await pgPool.connect();
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
    console.error(`[SnapshotRepository] Error fetching latest snapshot for room ${roomId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function saveSnapshotTransaction(
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

  const client = await pgPool.connect();
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
    console.error(`[SnapshotRepository] Transaction rolled back for room ${roomId}, index ${snapshotIndex}:`, err);
    throw err;
  } finally {
    client.release();
  }
}
