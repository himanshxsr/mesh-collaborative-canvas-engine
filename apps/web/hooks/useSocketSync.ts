import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  CanvasElement,
  CrdtSyncStep2Payload,
  CrdtUpdatePayload
} from '@mesh/shared-types';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

function parseUpdatePayload(
  payload: CrdtSyncStep2Payload | CrdtUpdatePayload | ArrayBuffer | string
): Uint8Array | null {
  if (typeof payload === 'string') {
    const binaryStr = atob(payload);
    return Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (payload && typeof payload === 'object' && 'update' in payload) {
    const up = payload.update;
    if (typeof up === 'string') {
      const binaryStr = atob(up);
      return Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
    }
    if (up instanceof ArrayBuffer) {
      return new Uint8Array(up);
    }
    if (up instanceof Uint8Array) {
      return up;
    }
  }
  return null;
}

export function useSocketSync(roomId: string, userId: string, userName: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [elements, setElements] = useState<Map<string, CanvasElement>>(new Map());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const docRef = useRef<Y.Doc>(new Y.Doc());
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  const syncElementsFromDoc = useCallback(() => {
    const yMap = docRef.current.getMap<CanvasElement>('canvas:elements');
    const newElements = new Map<string, CanvasElement>();
    yMap.forEach((val: CanvasElement, key: string) => {
      if (!val.isDeleted) {
        newElements.set(key, val);
      }
    });
    setElements(newElements);
  }, []);

  useEffect(() => {
    const yMap = docRef.current.getMap<CanvasElement>('canvas:elements');
    const um = new Y.UndoManager(yMap, {
      trackedOrigins: new Set([null, 'local'])
    });

    const updateUndoRedoState = () => {
      setCanUndo(um.undoStack.length > 0);
      setCanRedo(um.redoStack.length > 0);
    };

    um.on('stack-item-added', updateUndoRedoState);
    um.on('stack-item-popped', updateUndoRedoState);
    undoManagerRef.current = um;

    return () => {
      um.off('stack-item-added', updateUndoRedoState);
      um.off('stack-item-popped', updateUndoRedoState);
      um.destroy();
      undoManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const doc = docRef.current;
    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      syncElementsFromDoc();
      if (origin !== 'remote' && socketRef.current && socketRef.current.connected) {
        const base64Update = Buffer.from(update).toString('base64');
        socketRef.current.emit('crdt:sync-update', {
          roomId,
          update: base64Update
        });
      }
    };

    doc.on('update', handleDocUpdate);
    return () => {
      doc.off('update', handleDocUpdate);
    };
  }, [roomId, syncElementsFromDoc]);

  useEffect(() => {
    if (!roomId || !userId) return;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('room:join', { roomId, userId, userName });

      const stateVector = Y.encodeStateVector(docRef.current);
      socket.emit('crdt:sync-step-1', {
        roomId,
        stateVector
      });
    });

    socket.on('crdt:sync-step-2', (payload: CrdtSyncStep2Payload | ArrayBuffer | string) => {
      const updateData = parseUpdatePayload(payload);
      if (updateData && updateData.length > 0) {
        Y.applyUpdate(docRef.current, updateData, 'remote');
        syncElementsFromDoc();
      }
    });

    socket.on('crdt:sync-update', (payload: CrdtUpdatePayload | ArrayBuffer | string) => {
      const updateData = parseUpdatePayload(payload);
      if (updateData && updateData.length > 0) {
        Y.applyUpdate(docRef.current, updateData, 'remote');
        syncElementsFromDoc();
      }
    });

    socket.on('crdt:update', (payload: CrdtUpdatePayload | ArrayBuffer | string) => {
      const updateData = parseUpdatePayload(payload);
      if (updateData && updateData.length > 0) {
        Y.applyUpdate(docRef.current, updateData, 'remote');
        syncElementsFromDoc();
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, userId, userName, syncElementsFromDoc]);

  const addOrUpdateElement = useCallback((element: CanvasElement) => {
    const yMap = docRef.current.getMap<CanvasElement>('canvas:elements');
    docRef.current.transact(() => {
      yMap.set(element.id, element);
    }, 'local');
  }, []);

  const deleteElement = useCallback((id: string) => {
    const yMap = docRef.current.getMap<CanvasElement>('canvas:elements');
    const existing = yMap.get(id);
    if (existing) {
      docRef.current.transact(() => {
        yMap.set(id, { ...existing, isDeleted: true });
      }, 'local');
    }
  }, []);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  return {
    socket: socketRef.current,
    doc: docRef.current,
    elements,
    isConnected,
    addOrUpdateElement,
    deleteElement,
    canUndo,
    canRedo,
    undo,
    redo
  };
}
