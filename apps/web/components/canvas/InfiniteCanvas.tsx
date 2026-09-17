'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type {
  CameraState,
  CanvasElement,
  PathElement,
  StickyElement,
  CardElement,
  ConnectorElement,
  TextElement,
  EllipseElement,
  DiamondElement,
  WorldPoint,
  AwarenessPayload
} from '@mesh/shared-types';
import { screenToWorld, calculateFocalZoom } from '@/lib/math/coordinates';
import { ramerDouglasPeucker, generateSmoothBezierPath } from '@/lib/math/bezier';
import { ToolType } from '@/components/canvas/Toolbar';
import { sanitizeText } from '@/lib/security/sanitize';

interface InfiniteCanvasProps {
  elements: Map<string, CanvasElement>;
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onAddOrUpdateElement: (element: CanvasElement) => void;
  onDeleteElement: (id: string) => void;
  remotePresences: Map<string, AwarenessPayload>;
  onRegisterPointer: (pt: WorldPoint) => void;
  userId: string;
  userName: string;
  isDarkMode?: boolean;
  onUpdateSelection: (ids: string[]) => void;
  onUpdateChatMessage: (msg: string | undefined) => void;
  selectedElementIds: string[];
  onSetSelectedElementIds: (ids: string[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
}

function getOrganicRotationDeg(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return (hash % 30) / 10; // -1.5deg to +1.5deg
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tagName = el.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || el.isContentEditable;
}

export function InfiniteCanvas({
  elements,
  activeTool,
  onSelectTool,
  onAddOrUpdateElement,
  onDeleteElement,
  remotePresences,
  onRegisterPointer,
  userId,
  isDarkMode = true,
  onUpdateSelection,
  onUpdateChatMessage,
  selectedElementIds,
  onSetSelectedElementIds,
  onUndo,
  onRedo,
  strokeColor,
  strokeWidth,
  fillColor
}: InfiniteCanvasProps) {
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1.0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPathPoints, setCurrentPathPoints] = useState<Array<[number, number]>>([]);
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);

  const [marqueeStart, setMarqueeStart] = useState<WorldPoint | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<WorldPoint | null>(null);

  const [localCursor, setLocalCursor] = useState<WorldPoint>({ wx: 0, wy: 0 });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInputValue, setChatInputValue] = useState('');
  const chatFadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const textEditingRef = useRef<HTMLTextAreaElement>(null);

  const defaultInkColor = strokeColor === '#0f172a' && isDarkMode ? '#f1f5f9' : strokeColor;
  const actualFillColor = fillColor === 'tint' ? defaultInkColor + '33' : 'transparent';

  // Global Keyboard Shortcuts Routing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target) || editingElementId !== null) {
        return;
      }

      // Space Panning
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          selectedElementIds.forEach((id) => onDeleteElement(id));
          onSetSelectedElementIds([]);
          onUpdateSelection([]);
        }
        return;
      }

      // Cursor Chat '/'
      if (e.key === '/' && !isChatOpen) {
        e.preventDefault();
        setIsChatOpen(true);
        setChatInputValue('');
        setTimeout(() => chatInputRef.current?.focus(), 50);
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        if (isChatOpen) {
          setIsChatOpen(false);
          onUpdateChatMessage(undefined);
        }
        onSetSelectedElementIds([]);
        onUpdateSelection([]);
        setEditingElementId(null);
        return;
      }

      // Tool Shortcuts
      const key = e.key.toLowerCase();
      if (key === 'v') onSelectTool('select');
      else if (key === 'h') onSelectTool('hand');
      else if (key === 'p') onSelectTool('pen');
      else if (key === 't') onSelectTool('text');
      else if (key === 's') onSelectTool('sticky');
      else if (key === 'c') onSelectTool('card');
      else if (key === 'o') onSelectTool('ellipse');
      else if (key === 'd') onSelectTool('diamond');
      else if (key === 'e') onSelectTool('eraser');
      else if (key === 'l') onSelectTool('connector');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isChatOpen,
    editingElementId,
    selectedElementIds,
    onSelectTool,
    onDeleteElement,
    onSetSelectedElementIds,
    onUpdateSelection,
    onUpdateChatMessage,
    onUndo,
    onRedo
  ]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const targetZoom = camera.zoom * zoomFactor;

    const rect = containerRef.current?.getBoundingClientRect();
    const focalPoint = {
      sx: e.clientX - (rect?.left || 0),
      sy: e.clientY - (rect?.top || 0)
    };

    const newCamera = calculateFocalZoom(focalPoint, camera, targetZoom);
    setCamera(newCamera);
  }, [camera]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const isMiddleClick = e.button === 1;
    const isSpacePan = isSpacePressed || activeTool === 'hand' || e.shiftKey;

    if (isMiddleClick || isSpacePan) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    const screenPt = {
      sx: e.clientX - (rect?.left || 0),
      sy: e.clientY - (rect?.top || 0)
    };
    const worldPt = screenToWorld(screenPt, camera);

    // Eraser Tool
    if (activeTool === 'eraser') {
      elements.forEach((el) => {
        if (
          worldPt.wx >= el.x &&
          worldPt.wx <= el.x + el.width &&
          worldPt.wy >= el.y &&
          worldPt.wy <= el.y + el.height
        ) {
          onDeleteElement(el.id);
        }
      });
      return;
    }

    // Pen Tool
    if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentPathPoints([[worldPt.wx, worldPt.wy]]);
      return;
    }

    // Text Tool
    if (activeTool === 'text') {
      const newText: TextElement = {
        id: crypto.randomUUID(),
        type: 'text',
        x: worldPt.wx,
        y: worldPt.wy,
        width: 160,
        height: 40,
        rotation: 0,
        strokeColor: defaultInkColor,
        fillColor: 'transparent',
        strokeWidth: 1,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false,
        text: 'Text element',
        fontSize: 18
      };
      onAddOrUpdateElement(newText);
      setEditingElementId(newText.id);
      setEditingTextValue(newText.text);
      onSelectTool('select');
      return;
    }

    // Ellipse Tool
    if (activeTool === 'ellipse') {
      const newEllipse: EllipseElement = {
        id: crypto.randomUUID(),
        type: 'ellipse',
        x: worldPt.wx - 60,
        y: worldPt.wy - 60,
        width: 120,
        height: 120,
        rotation: 0,
        strokeColor: defaultInkColor,
        fillColor: actualFillColor,
        strokeWidth,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false
      };
      onAddOrUpdateElement(newEllipse);
      onSelectTool('select');
      onSetSelectedElementIds([newEllipse.id]);
      onUpdateSelection([newEllipse.id]);
      return;
    }

    // Diamond Tool
    if (activeTool === 'diamond') {
      const newDiamond: DiamondElement = {
        id: crypto.randomUUID(),
        type: 'diamond',
        x: worldPt.wx - 70,
        y: worldPt.wy - 50,
        width: 140,
        height: 100,
        rotation: 0,
        strokeColor: defaultInkColor,
        fillColor: actualFillColor,
        strokeWidth,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false
      };
      onAddOrUpdateElement(newDiamond);
      onSelectTool('select');
      onSetSelectedElementIds([newDiamond.id]);
      onUpdateSelection([newDiamond.id]);
      return;
    }

    // Sticky Note Tool
    if (activeTool === 'sticky') {
      const newSticky: StickyElement = {
        id: crypto.randomUUID(),
        type: 'sticky',
        x: worldPt.wx - 80,
        y: worldPt.wy - 80,
        width: 160,
        height: 160,
        rotation: (getOrganicRotationDeg(crypto.randomUUID()) * Math.PI) / 180,
        strokeColor: defaultInkColor,
        fillColor: '#fef08a',
        strokeWidth: 1,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false,
        text: 'New Sticky Note',
        colorTone: 'amber'
      };
      onAddOrUpdateElement(newSticky);
      onSelectTool('select');
      onSetSelectedElementIds([newSticky.id]);
      onUpdateSelection([newSticky.id]);
      return;
    }

    // Connector Tool
    if (activeTool === 'connector') {
      let clickedElementId: string | null = null;
      elements.forEach((el) => {
        if (
          worldPt.wx >= el.x &&
          worldPt.wx <= el.x + el.width &&
          worldPt.wy >= el.y &&
          worldPt.wy <= el.y + el.height
        ) {
          clickedElementId = el.id;
        }
      });

      if (clickedElementId) {
        if (!connectorSourceId) {
          setConnectorSourceId(clickedElementId);
        } else if (connectorSourceId !== clickedElementId) {
          const newConnector: ConnectorElement = {
            id: crypto.randomUUID(),
            type: 'connector',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            strokeColor: defaultInkColor,
            fillColor: 'transparent',
            strokeWidth: 2,
            zIndex: Date.now(),
            updatedAt: Date.now(),
            updatedBy: userId,
            isDeleted: false,
            sourceId: connectorSourceId,
            sourceAnchor: 'bottom',
            targetId: clickedElementId,
            targetAnchor: 'top'
          };
          onAddOrUpdateElement(newConnector);
          setConnectorSourceId(null);
          onSelectTool('select');
        }
      } else {
        setConnectorSourceId(null);
      }
      return;
    }

    // Architecture Card Tool
    if (activeTool === 'card') {
      const newCard: CardElement = {
        id: crypto.randomUUID(),
        type: 'card',
        x: worldPt.wx - 120,
        y: worldPt.wy - 80,
        width: 240,
        height: 160,
        rotation: 0,
        strokeColor: defaultInkColor,
        fillColor: isDarkMode ? '#181b24' : '#ffffff',
        strokeWidth: 1.5,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false,
        title: 'Architecture Node',
        markdownBody: '### System Component\n- Description block\n- Microservice'
      };
      onAddOrUpdateElement(newCard);
      onSelectTool('select');
      onSetSelectedElementIds([newCard.id]);
      onUpdateSelection([newCard.id]);
      return;
    }

    // Select Tool
    if (activeTool === 'select') {
      let clickedElementId: string | null = null;
      elements.forEach((el) => {
        if (
          worldPt.wx >= el.x &&
          worldPt.wx <= el.x + el.width &&
          worldPt.wy >= el.y &&
          worldPt.wy <= el.y + el.height
        ) {
          clickedElementId = el.id;
        }
      });

      if (clickedElementId) {
        const nextSelection = [clickedElementId];
        onSetSelectedElementIds(nextSelection);
        onUpdateSelection(nextSelection);
      } else {
        setMarqueeStart(worldPt);
        setMarqueeCurrent(worldPt);
        onSetSelectedElementIds([]);
        onUpdateSelection([]);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const screenPt = {
      sx: e.clientX - (rect?.left || 0),
      sy: e.clientY - (rect?.top || 0)
    };
    const worldPt = screenToWorld(screenPt, camera);

    setLocalCursor(worldPt);
    onRegisterPointer(worldPt);

    if (isPanning) {
      setCamera((prev: CameraState) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      }));
      return;
    }

    if (isDrawing) {
      setCurrentPathPoints((prev: Array<[number, number]>) => [...prev, [worldPt.wx, worldPt.wy]]);
      return;
    }

    if (marqueeStart) {
      setMarqueeCurrent(worldPt);
      const minX = Math.min(marqueeStart.wx, worldPt.wx);
      const maxX = Math.max(marqueeStart.wx, worldPt.wx);
      const minY = Math.min(marqueeStart.wy, worldPt.wy);
      const maxY = Math.max(marqueeStart.wy, worldPt.wy);

      const selectedIds: string[] = [];
      elements.forEach((el) => {
        const intersects =
          minX < el.x + el.width &&
          maxX > el.x &&
          minY < el.y + el.height &&
          maxY > el.y;

        if (intersects) {
          selectedIds.push(el.id);
        }
      });

      onSetSelectedElementIds(selectedIds);
      onUpdateSelection(selectedIds);
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (marqueeStart) {
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }

    if (isDrawing && currentPathPoints.length > 0) {
      setIsDrawing(false);
      const decimated = ramerDouglasPeucker(currentPathPoints, 0.5);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      decimated.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });

      const newPath: PathElement = {
        id: crypto.randomUUID(),
        type: 'path',
        x: minX === Infinity ? 0 : minX,
        y: minY === Infinity ? 0 : minY,
        width: Math.max(maxX - minX, 10),
        height: Math.max(maxY - minY, 10),
        rotation: 0,
        strokeColor: defaultInkColor,
        fillColor: 'transparent',
        strokeWidth,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false,
        points: decimated
      };

      onAddOrUpdateElement(newPath);
      setCurrentPathPoints([]);
    }
  };

  const handleDoubleClickElement = (el: CanvasElement) => {
    if (el.type === 'text') {
      const textEl = el as TextElement;
      setEditingElementId(el.id);
      setEditingTextValue(textEl.text || '');
    } else if (el.type === 'sticky') {
      const stickyEl = el as StickyElement;
      setEditingElementId(el.id);
      setEditingTextValue(stickyEl.text || '');
    } else if (el.type === 'card') {
      const cardEl = el as CardElement;
      setEditingElementId(el.id);
      setEditingTextValue(cardEl.title || '');
    }
  };

  const handleSaveEditingText = () => {
    if (!editingElementId) return;
    const existing = elements.get(editingElementId);
    if (!existing) return;

    if (existing.type === 'text') {
      onAddOrUpdateElement({
        ...(existing as TextElement),
        text: editingTextValue.trim() || 'Text element',
        updatedAt: Date.now(),
        updatedBy: userId
      });
    } else if (existing.type === 'sticky') {
      onAddOrUpdateElement({
        ...(existing as StickyElement),
        text: editingTextValue.trim() || 'Sticky Note',
        updatedAt: Date.now(),
        updatedBy: userId
      });
    } else if (existing.type === 'card') {
      onAddOrUpdateElement({
        ...(existing as CardElement),
        title: editingTextValue.trim() || 'Architecture Node',
        updatedAt: Date.now(),
        updatedBy: userId
      });
    }

    setEditingElementId(null);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInputValue.trim()) {
      onUpdateChatMessage(chatInputValue.trim());
      setIsChatOpen(false);

      if (chatFadeTimeoutRef.current) clearTimeout(chatFadeTimeoutRef.current);
      chatFadeTimeoutRef.current = setTimeout(() => {
        onUpdateChatMessage(undefined);
      }, 5000);
    } else {
      setIsChatOpen(false);
      onUpdateChatMessage(undefined);
    }
  };

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChatInputValue(val);
    onUpdateChatMessage(val);
  };

  const currentPathD = generateSmoothBezierPath(currentPathPoints);

  const cursorClass = isSpacePressed
    ? isPanning
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : activeTool === 'hand'
    ? 'cursor-grab'
    : activeTool === 'pen'
    ? 'cursor-crosshair'
    : activeTool === 'eraser'
    ? 'cursor-pointer'
    : 'cursor-default';

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-screen h-screen overflow-hidden canvas-dot-grid select-none ${cursorClass}`}
      style={{
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none origin-top-left"
        style={{
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0px) scale(${camera.zoom})`
        }}
      >
        <svg className="absolute inset-0 w-[50000px] h-[50000px] overflow-visible pointer-events-none">
          {Array.from(elements.values()).map((el) => {
            const isSelectedLocally = selectedElementIds.includes(el.id);
            const remoteSelectedPeers = Array.from(remotePresences.values()).filter((p) =>
              p.selectedElementIds?.includes(el.id)
            );
            const firstRemotePeer = remoteSelectedPeers[0];

            const strokeColorResolved =
              el.strokeColor === '#0f172a' && isDarkMode
                ? '#f1f5f9'
                : el.strokeColor === '#f1f5f9' && !isDarkMode
                ? '#0f172a'
                : el.strokeColor;

            // Path Renderer
            if (el.type === 'path') {
              const pathEl = el as PathElement;
              const pathD = generateSmoothBezierPath(pathEl.points);

              return (
                <g key={el.id}>
                  <path
                    d={pathD}
                    stroke={strokeColorResolved}
                    strokeWidth={pathEl.strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={isSelectedLocally ? 'stroke-accent-light dark:stroke-accent-dark stroke-[4px]' : ''}
                  />
                  {firstRemotePeer && (
                    <path
                      d={pathD}
                      stroke={firstRemotePeer.color}
                      strokeWidth={(pathEl.strokeWidth || 2) + 2}
                      fill="none"
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              );
            }

            // Ellipse Renderer
            if (el.type === 'ellipse') {
              const cx = el.x + el.width / 2;
              const cy = el.y + el.height / 2;
              const rx = Math.max(1, el.width / 2);
              const ry = Math.max(1, el.height / 2);

              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer" onDoubleClick={() => handleDoubleClickElement(el)}>
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    fill={el.fillColor || 'transparent'}
                    stroke={strokeColorResolved}
                    strokeWidth={el.strokeWidth || 2}
                    className={isSelectedLocally ? 'stroke-blue-500 stroke-[3px]' : ''}
                  />
                  {firstRemotePeer && (
                    <ellipse
                      cx={cx}
                      cy={cy}
                      rx={rx + 2}
                      ry={ry + 2}
                      fill="none"
                      stroke={firstRemotePeer.color}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              );
            }

            // Diamond Renderer
            if (el.type === 'diamond') {
              const top = `${el.x + el.width / 2},${el.y}`;
              const right = `${el.x + el.width},${el.y + el.height / 2}`;
              const bottom = `${el.x + el.width / 2},${el.y + el.height}`;
              const left = `${el.x},${el.y + el.height / 2}`;

              return (
                <g key={el.id} className="pointer-events-auto cursor-pointer" onDoubleClick={() => handleDoubleClickElement(el)}>
                  <polygon
                    points={`${top} ${right} ${bottom} ${left}`}
                    fill={el.fillColor || 'transparent'}
                    stroke={strokeColorResolved}
                    strokeWidth={el.strokeWidth || 2}
                    className={isSelectedLocally ? 'stroke-blue-500 stroke-[3px]' : ''}
                  />
                  {firstRemotePeer && (
                    <polygon
                      points={`${top} ${right} ${bottom} ${left}`}
                      fill="none"
                      stroke={firstRemotePeer.color}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              );
            }

            // Connector Renderer
            if (el.type === 'connector') {
              const conn = el as ConnectorElement;
              const sourceEl = elements.get(conn.sourceId);
              const targetEl = elements.get(conn.targetId);
              if (!sourceEl || !targetEl) return null;

              const sx = sourceEl.x + sourceEl.width / 2;
              const sy = sourceEl.y + sourceEl.height / 2;
              const tx = targetEl.x + targetEl.width / 2;
              const ty = targetEl.y + targetEl.height / 2;

              return (
                <g key={el.id}>
                  <line
                    x1={sx}
                    y1={sy}
                    x2={tx}
                    y2={ty}
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                  <polygon
                    points={`${tx},${ty} ${tx - 6},${ty - 10} ${tx + 6},${ty - 10}`}
                    fill="#64748b"
                  />
                </g>
              );
            }

            return null;
          })}

          {isDrawing && currentPathD && (
            <path
              d={currentPathD}
              stroke={defaultInkColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {marqueeStart && marqueeCurrent && (
            <rect
              x={Math.min(marqueeStart.wx, marqueeCurrent.wx)}
              y={Math.min(marqueeStart.wy, marqueeCurrent.wy)}
              width={Math.abs(marqueeCurrent.wx - marqueeStart.wx)}
              height={Math.abs(marqueeCurrent.wy - marqueeStart.wy)}
              fill="#2563eb"
              fillOpacity={0.15}
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
        </svg>

        {/* HTML Canvas Primitives (Text, Sticky, Card) */}
        {Array.from(elements.values()).map((el) => {
          const remoteSelectedPeers = Array.from(remotePresences.values()).filter((p) =>
            p.selectedElementIds?.includes(el.id)
          );
          const firstRemotePeer = remoteSelectedPeers[0];

          if (el.type === 'text') {
            const textEl = el as TextElement;
            const isLocallySelected = selectedElementIds.includes(el.id);
            const isEditingThis = editingElementId === el.id;

            return (
              <div
                key={el.id}
                onDoubleClick={() => handleDoubleClickElement(el)}
                className={`absolute p-1 rounded pointer-events-auto transition-all ${
                  isLocallySelected ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{
                  transform: `translate(${textEl.x}px, ${textEl.y}px)`,
                  minWidth: `${textEl.width}px`,
                  color: strokeColor === '#0f172a' && isDarkMode ? '#f1f5f9' : textEl.strokeColor
                }}
              >
                {isEditingThis ? (
                  <textarea
                    ref={textEditingRef}
                    autoFocus
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={handleSaveEditingText}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                        e.preventDefault();
                        handleSaveEditingText();
                      }
                    }}
                    className="bg-transparent border border-blue-500 text-sm font-medium focus:outline-none resize-none w-full h-full text-current"
                  />
                ) : (
                  <p className="font-sans font-medium text-base leading-snug whitespace-pre-wrap">
                    {sanitizeText(textEl.text)}
                  </p>
                )}
              </div>
            );
          }

          if (el.type === 'sticky') {
            const sticky = el as StickyElement;
            const rotDeg = getOrganicRotationDeg(sticky.id);
            const toneColors: Record<string, string> = {
              amber: 'bg-amber-100 text-amber-900 border-amber-300',
              sage: 'bg-emerald-100 text-emerald-900 border-emerald-300',
              slate: 'bg-slate-100 text-slate-900 border-slate-300',
              rose: 'bg-rose-100 text-rose-900 border-rose-300'
            };
            const colorStyle = toneColors[sticky.colorTone] || toneColors.amber;
            const isLocallySelected = selectedElementIds.includes(el.id);
            const isEditingThis = editingElementId === el.id;

            return (
              <div
                key={el.id}
                onDoubleClick={() => handleDoubleClickElement(el)}
                className={`absolute p-4 rounded-lg shadow-md border pointer-events-auto transition-transform ${colorStyle} ${
                  isLocallySelected ? 'ring-2 ring-[#2563eb]' : ''
                }`}
                style={{
                  transform: `translate(${sticky.x}px, ${sticky.y}px) rotate(${rotDeg}deg)`,
                  width: `${sticky.width}px`,
                  height: `${sticky.height}px`,
                  borderColor: firstRemotePeer ? firstRemotePeer.color : undefined,
                  borderWidth: firstRemotePeer ? '2px' : undefined
                }}
              >
                {firstRemotePeer && (
                  <div
                    className="absolute -top-6 left-0 px-2 py-0.5 rounded-t-md text-[10px] font-bold text-white shadow-sm whitespace-nowrap"
                    style={{ backgroundColor: firstRemotePeer.color }}
                  >
                    {firstRemotePeer.userName}
                  </div>
                )}
                {isEditingThis ? (
                  <textarea
                    autoFocus
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={handleSaveEditingText}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleSaveEditingText();
                      }
                    }}
                    className="w-full h-full bg-transparent font-sans text-sm leading-snug font-medium focus:outline-none resize-none"
                  />
                ) : (
                  <p className="font-sans text-sm leading-snug whitespace-pre-wrap font-medium">
                    {sanitizeText(sticky.text)}
                  </p>
                )}
              </div>
            );
          }

          if (el.type === 'card') {
            const card = el as CardElement;
            const isLocallySelected = selectedElementIds.includes(el.id);
            const isEditingThis = editingElementId === el.id;

            return (
              <div
                key={el.id}
                onDoubleClick={() => handleDoubleClickElement(el)}
                className={`absolute p-4 rounded-xl shadow-lg border border-[#e2e8f0] dark:border-[#272b37] bg-white dark:bg-[#181b24] text-[#0f172a] dark:text-[#f1f5f9] pointer-events-auto ${
                  isLocallySelected ? 'ring-2 ring-[#2563eb]' : ''
                }`}
                style={{
                  transform: `translate(${card.x}px, ${card.y}px)`,
                  width: `${card.width}px`,
                  height: `${card.height}px`,
                  borderColor: firstRemotePeer ? firstRemotePeer.color : undefined,
                  borderWidth: firstRemotePeer ? '2px' : undefined
                }}
              >
                {firstRemotePeer && (
                  <div
                    className="absolute -top-6 left-0 px-2 py-0.5 rounded-t-md text-[10px] font-bold text-white shadow-sm whitespace-nowrap"
                    style={{ backgroundColor: firstRemotePeer.color }}
                  >
                    {firstRemotePeer.userName}
                  </div>
                )}
                {isEditingThis ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={handleSaveEditingText}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        handleSaveEditingText();
                      }
                    }}
                    className="w-full bg-transparent font-semibold text-base mb-1 border-b pb-1 border-[#2563eb] focus:outline-none text-current"
                  />
                ) : (
                  <h4 className="font-semibold text-base mb-1 border-b pb-1 border-[#e2e8f0] dark:border-[#272b37]">
                    {sanitizeText(card.title)}
                  </h4>
                )}
                <p className="text-xs text-[#64748b] dark:text-[#94a3b8] whitespace-pre-wrap">
                  {sanitizeText(card.markdownBody)}
                </p>
              </div>
            );
          }

          return null;
        })}

        {/* Remote Cursors & Chat */}
        {Array.from(remotePresences.values()).map((presence) => {
          if (!presence.cursor) return null;
          const { wx, wy } = presence.cursor;

          return (
            <div
              key={presence.clientId}
              className="absolute pointer-events-none transition-transform duration-75 ease-out z-40"
              style={{
                transform: `translate(${wx}px, ${wy}px)`
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill={presence.color || '#2563eb'}
                stroke="white"
                strokeWidth="1.5"
                className="drop-shadow-md"
              >
                <path d="M5.5 3.5L19 12L12.5 14.5L9.5 21L5.5 3.5Z" />
              </svg>

              <div
                className="ml-4 px-2 py-0.5 rounded-full text-xs font-semibold text-white shadow-md whitespace-nowrap"
                style={{ backgroundColor: presence.color || '#2563eb' }}
              >
                {presence.userName || 'Peer'}
              </div>

              {presence.chatMessage && (
                <div className="ml-4 mt-1 px-3 py-1.5 rounded-2xl bg-white dark:bg-[#181b24] text-[#0f172a] dark:text-[#f1f5f9] text-xs font-medium shadow-lg border border-[#e2e8f0] dark:border-[#272b37] max-w-xs break-words">
                  {presence.chatMessage}
                </div>
              )}
            </div>
          );
        })}

        {/* Ephemeral Cursor Chat Input */}
        {isChatOpen && (
          <div
            className="absolute pointer-events-auto z-50 transform -translate-y-full mb-2"
            style={{
              transform: `translate(${localCursor.wx}px, ${localCursor.wy - 10}px)`
            }}
          >
            <form onSubmit={handleChatSubmit} className="flex items-center">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInputValue}
                onChange={handleChatInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    handleChatSubmit(e);
                  }
                }}
                placeholder="Say something... (Press Enter)"
                className="px-3 py-1.5 rounded-full bg-white dark:bg-[#181b24] border border-[#2563eb] text-xs text-[#0f172a] dark:text-[#f1f5f9] placeholder-[#94a3b8] shadow-xl focus:outline-none w-56"
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
