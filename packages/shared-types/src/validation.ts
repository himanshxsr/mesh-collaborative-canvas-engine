export const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidRoomId(roomId: string | undefined | null): boolean {
  if (!roomId || typeof roomId !== 'string') return false;
  return ROOM_ID_REGEX.test(roomId);
}

export const MAX_PAYLOAD_BYTES = 65536; // 64 KB
export const MAX_MESSAGES_PER_SEC = 120;
