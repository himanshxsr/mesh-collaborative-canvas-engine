'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type {
  CameraState,
  CanvasElement,
  PathElement,
  StickyElement,
  CardElement,
  ConnectorElement,
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
  onAddOrUpdateElement: (element: CanvasElement) => void;
  onDeleteElement: (id: string) => void;
  remotePresences: Map<string, AwarenessPayload>;
  onRegisterPointer: (pt: WorldPoint) => void;
  userId: string;
  userName: string;
  isDarkMode?: boolean;
  onUpdateSelection: (ids: string[]) => void;
  onUpdateChatMessage: (msg: string | undefined) => void;
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
  onAddOrUpdateElement,
  remotePresences,
  onRegisterPointer,
  userId,
  isDarkMode = true,
  onUpdateSelection,
  onUpdateChatMessage
}: InfiniteCanvasProps) {
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1.0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPathPoints, setCurrentPathPoints] = useState<Array<[number, number]>>([]);

  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [marqueeStart, setMarqueeStart] = useState<WorldPoint | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<WorldPoint | null>(null);

  const [localCursor, setLocalCursor] = useState<WorldPoint>({ wx: 0, wy: 0 });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInputValue, setChatInputValue] = useState('');
  const chatFadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const defaultInkColor = isDarkMode ? '#f1f5f9' : '#0f172a';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditableElement(e.target)) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      if (e.key === '/' && !isEditableElement(e.target) && !isChatOpen) {
        e.preventDefault();
        setIsChatOpen(true);
        setChatInputValue('');
        setTimeout(() => chatInputRef.current?.focus(), 50);
      }

      if (e.key === 'Escape') {
        if (isChatOpen) {
          setIsChatOpen(false);
          onUpdateChatMessage(undefined);
        }
        setSelectedElementIds([]);
        onUpdateSelection([]);
      }
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
  }, [isChatOpen, onUpdateChatMessage, onUpdateSelection]);

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

    if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentPathPoints([[worldPt.wx, worldPt.wy]]);
      return;
    }

    if (activeTool === 'sticky') {
      const newSticky: StickyElement = {
        id: crypto.randomUUID(),
        type: 'sticky',
        x: worldPt.wx - 80,
        y: worldPt.wy - 80,
        width: 160,
        height: 160,
        rotation: (getOrganicRotationDeg(crypto.randomUUID()) * Math.PI) / 180,
        strokeColor: '#e2e8f0',
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
      return;
    }

    if (activeTool === 'card') {
      const newCard: CardElement = {
        id: crypto.randomUUID(),
        type: 'card',
        x: worldPt.wx - 120,
        y: worldPt.wy - 80,
        width: 240,
        height: 160,
        rotation: 0,
        strokeColor: '#cbd5e1',
        fillColor: '#ffffff',
        strokeWidth: 1,
        zIndex: Date.now(),
        updatedAt: Date.now(),
        updatedBy: userId,
        isDeleted: false,
        title: 'Architecture Node',
        markdownBody: '### System Component\n- Description block\n- Microservice'
      };
      onAddOrUpdateElement(newCard);
      return;
    }

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
        setSelectedElementIds(nextSelection);
        onUpdateSelection(nextSelection);
      } else {
        setMarqueeStart(worldPt);
        setMarqueeCurrent(worldPt);
        setSelectedElementIds([]);
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

      setSelectedElementIds(selectedIds);
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
        strokeWidth: 3,
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
            if (el.type === 'path') {
              const pathEl = el as PathElement;
              const pathD = generateSmoothBezierPath(pathEl.points);
              const isSelectedLocally = selectedElementIds.includes(el.id);

              const strokeColor =
                pathEl.strokeColor === '#0f172a' && isDarkMode
                  ? '#f1f5f9'
                  : pathEl.strokeColor === '#f1f5f9' && !isDarkMode
                  ? '#0f172a'
                  : pathEl.strokeColor;

              return (
                <path
                  key={el.id}
                  d={pathD}
                  stroke={strokeColor}
                  strokeWidth={pathEl.strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isSelectedLocally ? 'stroke-accent-light dark:stroke-accent-dark stroke-[4px]' : ''}
                />
              );
            }

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
              strokeWidth={3}
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

        {Array.from(elements.values()).map((el) => {
          const remoteSelectedPeers = Array.from(remotePresences.values()).filter((p) =>
            p.selectedElementIds?.includes(el.id)
          );
          const firstRemotePeer = remoteSelectedPeers[0];

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

            return (
              <div
                key={el.id}
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
                <p className="font-sans text-sm leading-snug whitespace-pre-wrap font-medium">
                  {sanitizeText(sticky.text)}
                </p>
              </div>
            );
          }

          if (el.type === 'card') {
            const card = el as CardElement;
            const isLocallySelected = selectedElementIds.includes(el.id);

            return (
              <div
                key={el.id}
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
                <h4 className="font-semibold text-base mb-1 border-b pb-1 border-[#e2e8f0] dark:border-[#272b37]">
                  {sanitizeText(card.title)}
                </h4>
                <p className="text-xs text-[#64748b] dark:text-[#94a3b8] whitespace-pre-wrap">
                  {sanitizeText(card.markdownBody)}
                </p>
              </div>
            );
          }

          return null;
        })}

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
