import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import * as Y from 'yjs';
import {
  isValidRoomId,
  MAX_PAYLOAD_BYTES,
  MAX_MESSAGES_PER_SEC,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type InterServerEvents,
  type SocketData,
  type RoomJoinPayload,
  type CrdtSyncStep1Payload,
  type CrdtUpdatePayload,
  type PresenceUpdatePayload,
  type AwarenessPayload
} from '@mesh/shared-types';
import { pubClient, subClient, cmdClient } from '../config/redis.js';
import {
  appendStreamDelta,
  updateRoomActivity,
  updateConnectionCount,
  updatePresenceHash,
  removePresenceFromHash
} from '../pipeline/streamProducer.js';

const roomDocs = new Map<string, Y.Doc>();
const socketMessageTimestamps = new Map<string, number[]>();

function getOrCreateRoomDoc(roomId: string): Y.Doc {
  let doc = roomDocs.get(roomId);
  if (!doc) {
    doc = new Y.Doc();
    roomDocs.set(roomId, doc);
  }
  return doc;
}

async function syncRoomDocFromStream(roomId: string): Promise<Y.Doc> {
  const doc = getOrCreateRoomDoc(roomId);
  try {
    const streamKey = `canvas:room:${roomId}:stream`;
    const streamEntries = await cmdClient.xrange(streamKey, '-', '+');
    if (streamEntries && Array.isArray(streamEntries)) {
      for (const [, fields] of streamEntries) {
        if (Array.isArray(fields)) {
          const deltaIndex = fields.indexOf('delta');
          const deltaBase64 = deltaIndex !== -1 ? fields[deltaIndex + 1] : fields[1];
          if (deltaBase64) {
            Y.applyUpdate(doc, Buffer.from(deltaBase64, 'base64'));
          }
        }
      }
    }
  } catch (err) {
    console.error(`[SocketGateway] Error syncing room doc from stream for ${roomId}:`, err);
  }
  return doc;
}

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const windowMs = 1000;
  let timestamps = socketMessageTimestamps.get(socketId) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= MAX_MESSAGES_PER_SEC) {
    socketMessageTimestamps.set(socketId, timestamps);
    return true;
  }

  timestamps.push(now);
  socketMessageTimestamps.set(socketId, timestamps);
  return false;
}

export function configureSocketGateway(httpServer: HttpServer) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`[SocketGateway] Blocked CORS origin: ${origin}`);
          callback(new Error('CORS origin not allowed'));
        }
      },
      methods: ['GET', 'POST']
    },
    transports: ['websocket'],
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: MAX_PAYLOAD_BYTES
  });

  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    if (isRateLimited(socket.id)) {
      console.warn(`[SocketGateway] Rate limit exceeded for socket ${socket.id}`);
      return next(new Error('Rate limit exceeded'));
    }
    next();
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    console.log(`[SocketGateway] Client connected: ${socket.id}`);

    socket.on('room:join', async (payload: RoomJoinPayload) => {
      try {
        const { roomId, userId, userName } = payload;
        if (!isValidRoomId(roomId)) {
          console.warn(`[SocketGateway] Invalid roomId join attempt: ${roomId} from ${socket.id}`);
          socket.emit('room:terminate', 'Invalid Room ID format');
          socket.disconnect(true);
          return;
        }

        socket.data.roomId = roomId;
        socket.data.userId = userId;
        socket.data.userName = userName;

        await socket.join(roomId);
        const activeConnections = await updateConnectionCount(roomId, 1);

        socket.emit('room:joined', { roomId, activeConnections });

        const doc = await syncRoomDocFromStream(roomId);
        const fullStateUpdate = Y.encodeStateAsUpdate(doc);
        const base64Update = Buffer.from(fullStateUpdate).toString('base64');
        socket.emit('crdt:sync-step-2', {
          roomId,
          update: base64Update
        });

        console.log(`[SocketGateway] User ${userName} (${userId}) joined room ${roomId}. Active: ${activeConnections}`);
      } catch (err) {
        console.error('[SocketGateway] Error on room:join:', err);
      }
    });

    socket.on('crdt:sync-step-1', async (payload: CrdtSyncStep1Payload | ArrayBuffer) => {
      try {
        if (isRateLimited(socket.id)) return;

        let roomId = socket.data.roomId;
        let stateVector: Uint8Array | undefined;

        if (payload instanceof ArrayBuffer) {
          if (payload.byteLength > MAX_PAYLOAD_BYTES) return;
          stateVector = new Uint8Array(payload);
        } else if (payload && typeof payload === 'object' && 'stateVector' in payload) {
          roomId = payload.roomId || roomId;
          const sv = payload.stateVector;
          if (sv) {
            const byteLen = sv instanceof ArrayBuffer ? sv.byteLength : sv.length;
            if (byteLen > MAX_PAYLOAD_BYTES) return;
            stateVector = sv instanceof ArrayBuffer ? new Uint8Array(sv) : new Uint8Array(sv);
          }
        }

        if (!isValidRoomId(roomId)) {
          return;
        }

        const doc = await syncRoomDocFromStream(roomId);
        const diffUpdate = stateVector
          ? Y.encodeStateAsUpdate(doc, stateVector)
          : Y.encodeStateAsUpdate(doc);

        const base64Update = Buffer.from(diffUpdate).toString('base64');

        socket.emit('crdt:sync-step-2', {
          roomId,
          update: base64Update
        });
      } catch (err) {
        console.error('[SocketGateway] Error on crdt:sync-step-1:', err);
      }
    });

    const handleCrdtUpdate = async (payload: CrdtUpdatePayload | ArrayBuffer | string) => {
      try {
        if (isRateLimited(socket.id)) return;

        let roomId = socket.data.roomId;
        let updateData: Uint8Array;

        if (payload instanceof ArrayBuffer) {
          if (payload.byteLength > MAX_PAYLOAD_BYTES) return;
          updateData = new Uint8Array(payload);
        } else if (typeof payload === 'string') {
          const binaryStr = atob(payload);
          updateData = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
        } else if (payload && typeof payload === 'object' && 'update' in payload) {
          roomId = payload.roomId || roomId;
          const up = payload.update;
          if (typeof up === 'string') {
            const binaryStr = atob(up);
            updateData = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
          } else {
            const byteLen = up instanceof ArrayBuffer ? up.byteLength : up.byteLength;
            if (byteLen > MAX_PAYLOAD_BYTES) return;
            updateData = up instanceof ArrayBuffer ? new Uint8Array(up) : up;
          }
        } else {
          return;
        }

        if (!isValidRoomId(roomId)) {
          return;
        }

        const doc = getOrCreateRoomDoc(roomId);
        Y.applyUpdate(doc, updateData);

        const base64Str = Buffer.from(updateData).toString('base64');
        socket.to(roomId).emit('crdt:sync-update', { roomId, update: base64Str });

        await appendStreamDelta(roomId, updateData);
        await updateRoomActivity(roomId);
      } catch (err) {
        console.error('[SocketGateway] Error processing CRDT update:', err);
      }
    };

    socket.on('crdt:sync-update', handleCrdtUpdate);
    socket.on('crdt:update', handleCrdtUpdate);

    const handlePresenceUpdate = async (payload: PresenceUpdatePayload | AwarenessPayload) => {
      try {
        if (isRateLimited(socket.id)) return;

        let roomId = socket.data.roomId;
        let presenceObj: AwarenessPayload;

        if (payload && typeof payload === 'object' && 'presence' in payload) {
          roomId = payload.roomId || roomId;
          presenceObj = payload.presence;
        } else {
          presenceObj = payload as AwarenessPayload;
        }

        if (!isValidRoomId(roomId)) {
          return;
        }

        socket.to(roomId).emit('presence:update', { roomId, presence: presenceObj });

        const presenceJson = JSON.stringify(presenceObj);
        await updatePresenceHash(roomId, socket.id, presenceJson, 10);
      } catch (err) {
        console.error('[SocketGateway] Error processing presence update:', err);
      }
    };

    socket.on('awareness:update', handlePresenceUpdate);
    socket.on('presence:update', handlePresenceUpdate);

    socket.on('heartbeat', () => {
      if (socket.data.roomId && isValidRoomId(socket.data.roomId)) {
        updateRoomActivity(socket.data.roomId).catch(() => {});
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[SocketGateway] Client disconnected: ${socket.id}`);
      socketMessageTimestamps.delete(socket.id);
      const roomId = socket.data.roomId;
      if (roomId && isValidRoomId(roomId)) {
        try {
          await removePresenceFromHash(roomId, socket.id);
          const activeCount = await updateConnectionCount(roomId, -1);
          console.log(`[SocketGateway] Client left room ${roomId}. Remaining active: ${activeCount}`);
        } catch (err) {
          console.error('[SocketGateway] Error during disconnect cleanup:', err);
        }
      }
    });
  });

  return io;
}
