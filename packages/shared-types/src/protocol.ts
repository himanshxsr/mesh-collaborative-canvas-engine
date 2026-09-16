import type { WorldPoint } from './canvas.js';

export enum MessageType {
  SYNC_STEP_1 = 0x01,       // Client sends state vector to server
  SYNC_STEP_2 = 0x02,       // Server responds with missing diff updates
  SYNC_UPDATE = 0x03,       // Client/Server incremental Yjs delta
  AWARENESS_UPDATE = 0x04,  // Clamped 60Hz mouse pointer / selection vector
  HEARTBEAT = 0x05,         // Health check frame
  ROOM_TERMINATE = 0x06     // Server-initiated graceful teardown
}

export interface AwarenessPayload {
  clientId: string;
  userId: string;
  userName: string;
  cursor: WorldPoint | null;
  selectedElementIds: string[];
  color: string;
  lastUpdated: number;
  chatMessage?: string;
}
