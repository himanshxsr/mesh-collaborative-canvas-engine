import { useEffect, useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AwarenessPayload,
  WorldPoint,
  PresenceUpdatePayload
} from '@mesh/shared-types';
import { usePointerThrottle } from '@/hooks/usePointerThrottle';

export function usePresence(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  roomId: string,
  userId: string,
  userName: string,
  userColor: string
) {
  const [remotePresences, setRemotePresences] = useState<Map<string, AwarenessPayload>>(new Map());
  const selectedIdsRef = useRef<string[]>([]);
  const chatMessageRef = useRef<string | undefined>(undefined);

  const handleFlushPointer = useCallback((point: WorldPoint) => {
    if (!socket || !socket.connected || !roomId) return;

    const payload: AwarenessPayload = {
      clientId: socket.id || userId,
      userId,
      userName,
      cursor: point,
      selectedElementIds: selectedIdsRef.current,
      color: userColor,
      lastUpdated: Date.now(),
      chatMessage: chatMessageRef.current
    };

    socket.emit('presence:update', {
      roomId,
      presence: payload
    });
  }, [socket, roomId, userId, userName, userColor]);

  const { registerPoint } = usePointerThrottle(handleFlushPointer, 16.6);

  useEffect(() => {
    if (!socket) return;

    const handlePresence = (payload: PresenceUpdatePayload | AwarenessPayload) => {
      let presenceObj: AwarenessPayload;
      if (payload && typeof payload === 'object' && 'presence' in payload) {
        presenceObj = payload.presence;
      } else {
        presenceObj = payload as AwarenessPayload;
      }

      if (presenceObj.userId === userId || presenceObj.clientId === socket.id) {
        return;
      }

      setRemotePresences((prev: Map<string, AwarenessPayload>) => {
        const next = new Map(prev);
        next.set(presenceObj.clientId, presenceObj);
        return next;
      });
    };

    socket.on('presence:update', handlePresence);
    socket.on('awareness:update', handlePresence);

    return () => {
      socket.off('presence:update', handlePresence);
      socket.off('awareness:update', handlePresence);
    };
  }, [socket, userId]);

  const updateSelection = useCallback((ids: string[]) => {
    selectedIdsRef.current = ids;
    if (socket && socket.connected && roomId) {
      const payload: AwarenessPayload = {
        clientId: socket.id || userId,
        userId,
        userName,
        cursor: null,
        selectedElementIds: ids,
        color: userColor,
        lastUpdated: Date.now(),
        chatMessage: chatMessageRef.current
      };

      socket.emit('presence:update', {
        roomId,
        presence: payload
      });
    }
  }, [socket, roomId, userId, userName, userColor]);

  const updateChatMessage = useCallback((message: string | undefined) => {
    chatMessageRef.current = message;
    if (socket && socket.connected && roomId) {
      const payload: AwarenessPayload = {
        clientId: socket.id || userId,
        userId,
        userName,
        cursor: null,
        selectedElementIds: selectedIdsRef.current,
        color: userColor,
        lastUpdated: Date.now(),
        chatMessage: message
      };

      socket.emit('presence:update', {
        roomId,
        presence: payload
      });
    }
  }, [socket, roomId, userId, userName, userColor]);

  return {
    remotePresences,
    registerPoint,
    updateSelection,
    updateChatMessage
  };
}
