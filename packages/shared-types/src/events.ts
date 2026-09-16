import type { AwarenessPayload } from './protocol.js';

export interface RoomJoinPayload {
  roomId: string;
  userId: string;
  userName: string;
}

export interface CrdtSyncStep1Payload {
  roomId: string;
  stateVector: Uint8Array | ArrayBuffer;
}

export interface CrdtSyncStep2Payload {
  roomId: string;
  update: Uint8Array | ArrayBuffer;
}

export interface CrdtUpdatePayload {
  roomId: string;
  update: Uint8Array | ArrayBuffer;
}

export interface PresenceUpdatePayload {
  roomId: string;
  presence: AwarenessPayload;
}

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinPayload) => void;
  'crdt:sync-step-1': (payload: CrdtSyncStep1Payload | ArrayBuffer) => void;
  'crdt:sync-update': (payload: CrdtUpdatePayload | ArrayBuffer) => void;
  'crdt:update': (payload: CrdtUpdatePayload | ArrayBuffer) => void;
  'awareness:update': (payload: PresenceUpdatePayload | AwarenessPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload | AwarenessPayload) => void;
  'heartbeat': () => void;
}

export interface ServerToClientEvents {
  'room:joined': (payload: { roomId: string; activeConnections: number }) => void;
  'crdt:sync-step-2': (payload: CrdtSyncStep2Payload | ArrayBuffer) => void;
  'crdt:sync-update': (payload: CrdtUpdatePayload | ArrayBuffer) => void;
  'crdt:update': (payload: CrdtUpdatePayload | ArrayBuffer) => void;
  'awareness:update': (payload: PresenceUpdatePayload | AwarenessPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload | AwarenessPayload) => void;
  'room:terminate': (reason: string) => void;
}

export interface InterServerEvents {
  'ping': () => void;
}

export interface SocketData {
  userId: string;
  roomId: string;
  userName: string;
}
