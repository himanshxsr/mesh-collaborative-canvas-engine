import { useEffect, useRef, useCallback } from 'react';
import type { WorldPoint } from '@mesh/shared-types';

export function usePointerThrottle(
  onFlush: (point: WorldPoint) => void,
  hzInterval: number = 16.6
) {
  const pendingPoint = useRef<WorldPoint | null>(null);
  const lastDispatchedPoint = useRef<WorldPoint | null>(null);
  const lastDispatchTime = useRef<number>(0);

  const registerPoint = useCallback((pt: WorldPoint) => {
    pendingPoint.current = pt;
  }, []);

  useEffect(() => {
    let frameId: number;

    const tick = (now: number) => {
      if (pendingPoint.current && now - lastDispatchTime.current >= hzInterval) {
        const current = pendingPoint.current;
        const previous = lastDispatchedPoint.current;

        let shouldDispatch = true;
        if (previous) {
          const dx = current.wx - previous.wx;
          const dy = current.wy - previous.wy;
          const distance = Math.hypot(dx, dy);
          if (distance < 0.25) {
            shouldDispatch = false;
          }
        }

        if (shouldDispatch) {
          onFlush(current);
          lastDispatchedPoint.current = current;
          lastDispatchTime.current = now;
        }

        pendingPoint.current = null;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [onFlush, hzInterval]);

  return { registerPoint };
}
