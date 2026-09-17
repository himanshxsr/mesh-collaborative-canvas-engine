export interface ScreenPoint {
  readonly sx: number;
  readonly sy: number;
}

export interface WorldPoint {
  readonly wx: number;
  readonly wy: number;
}

export interface CameraState {
  x: number;       // Horizontal panning translation in pixels
  y: number;       // Vertical panning translation in pixels
  zoom: number;    // Clamped scale factor: 0.15 <= zoom <= 3.0
}

export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type ElementType = 'rectangle' | 'ellipse' | 'path' | 'sticky' | 'card' | 'connector' | 'text' | 'diamond';

export interface BaseElement {
  readonly id: string;           // UUIDv4
  type: ElementType;
  x: number;                     // World Space X
  y: number;                     // World Space Y
  width: number;                 // Bounding box width
  height: number;                // Bounding box height
  rotation: number;              // Radians [0, 2π)
  strokeColor: string;           // Strict Hex: ^#([A-Fa-f0-9]{6})$
  fillColor: string;             // Strict Hex or 'transparent'
  strokeWidth: number;           // World coordinate units (1 to 32)
  zIndex: number;                // Monotonically increasing sequence
  updatedAt: number;             // UNIX epoch millisecond
  updatedBy: string;             // Client socket/user ID
  isDeleted: boolean;            // Soft deletion flag for tombstone CRDT cleanup
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle';
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
}

export interface DiamondElement extends BaseElement {
  type: 'diamond';
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number; // 14, 18, 24, 32
}

export interface PathElement extends BaseElement {
  type: 'path';
  points: ReadonlyArray<[number, number]>; // Array of [wx, wy]
}

export interface StickyElement extends BaseElement {
  type: 'sticky';
  text: string;
  colorTone: 'amber' | 'sage' | 'slate' | 'rose';
}

export interface CardElement extends BaseElement {
  type: 'card';
  title: string;
  markdownBody: string;
}

export interface ConnectorElement extends BaseElement {
  type: 'connector';
  sourceId: string;
  sourceAnchor: 'top' | 'bottom' | 'left' | 'right';
  targetId: string;
  targetAnchor: 'top' | 'bottom' | 'left' | 'right';
}

export type CanvasElement =
  | RectangleElement
  | EllipseElement
  | DiamondElement
  | TextElement
  | PathElement
  | StickyElement
  | CardElement
  | ConnectorElement;

