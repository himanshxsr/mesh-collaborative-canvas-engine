import type { ScreenPoint, WorldPoint, CameraState } from '@mesh/shared-types';

export function screenToWorld(sp: ScreenPoint, cam: CameraState): WorldPoint {
  return {
    wx: (sp.sx - cam.x) / cam.zoom,
    wy: (sp.sy - cam.y) / cam.zoom,
  };
}

export function worldToScreen(wp: WorldPoint, cam: CameraState): ScreenPoint {
  return {
    sx: wp.wx * cam.zoom + cam.x,
    sy: wp.wy * cam.zoom + cam.y,
  };
}

export function calculateFocalZoom(
  focalPoint: ScreenPoint,
  currentCam: CameraState,
  targetZoom: number
): CameraState {
  const clampedZoom = Math.min(Math.max(targetZoom, 0.15), 3.0);
  const factor = clampedZoom / currentCam.zoom;

  return {
    x: focalPoint.sx - (focalPoint.sx - currentCam.x) * factor,
    y: focalPoint.sy - (focalPoint.sy - currentCam.y) * factor,
    zoom: clampedZoom,
  };
}
