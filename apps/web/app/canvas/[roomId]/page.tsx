'use client';

import React, { useState } from 'react';
import { useSocketSync } from '@/hooks/useSocketSync';
import { usePresence } from '@/hooks/usePresence';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar, ToolType } from '@/components/canvas/Toolbar';
import { exportToSvg, exportToPng } from '@/lib/export/canvasExport';

interface PageProps {
  params: Promise<{
    roomId: string;
  }>;
}

const USER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2'];

export default function CanvasPage({ params }: PageProps) {
  const reactUse = (React as unknown as { use?: <T>(p: Promise<T>) => T }).use;
  const resolvedParams = reactUse ? reactUse(params) : (params as unknown as { roomId: string });
  const roomId = resolvedParams.roomId;

  const [userId] = useState(() => `user_${Math.random().toString(36).substring(2, 9)}`);
  const [userName] = useState(() => `Collaborator ${Math.floor(Math.random() * 1000)}`);
  const [userColor] = useState(() => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Contextual Style State
  const [strokeColor, setStrokeColor] = useState('#0f172a');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fillColor, setFillColor] = useState('transparent');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);

  const {
    socket,
    elements,
    isConnected,
    addOrUpdateElement,
    deleteElement,
    canUndo,
    canRedo,
    undo,
    redo
  } = useSocketSync(roomId, userId, userName);

  const { remotePresences, registerPoint, updateSelection, updateChatMessage } = usePresence(
    socket,
    roomId,
    userId,
    userName,
    userColor
  );

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };

  const handleSelectColor = (color: string) => {
    setStrokeColor(color);
    selectedElementIds.forEach((id) => {
      const el = elements.get(id);
      if (el) {
        addOrUpdateElement({
          ...el,
          strokeColor: color,
          updatedAt: Date.now(),
          updatedBy: userId
        });
      }
    });
  };

  const handleSelectStrokeWidth = (width: number) => {
    setStrokeWidth(width);
    selectedElementIds.forEach((id) => {
      const el = elements.get(id);
      if (el) {
        addOrUpdateElement({
          ...el,
          strokeWidth: width,
          updatedAt: Date.now(),
          updatedBy: userId
        });
      }
    });
  };

  const handleSelectFillColor = (fill: string) => {
    setFillColor(fill);
    selectedElementIds.forEach((id) => {
      const el = elements.get(id);
      if (el) {
        const actualFill = fill === 'tint' ? strokeColor + '33' : 'transparent';
        addOrUpdateElement({
          ...el,
          fillColor: actualFill,
          updatedAt: Date.now(),
          updatedBy: userId
        });
      }
    });
  };

  const handleExportSvg = () => {
    exportToSvg(Array.from(elements.values()), isDarkMode, roomId);
  };

  const handleExportPng = async () => {
    await exportToPng(Array.from(elements.values()), isDarkMode, roomId);
  };

  const activeParticipantCount = remotePresences.size + 1;
  const showStyleBar = activeTool !== 'hand' && (activeTool !== 'select' || selectedElementIds.length > 0);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-canvas-light dark:bg-canvas-dark">
      <InfiniteCanvas
        elements={elements}
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onAddOrUpdateElement={addOrUpdateElement}
        onDeleteElement={deleteElement}
        remotePresences={remotePresences}
        onRegisterPointer={registerPoint}
        userId={userId}
        userName={userName}
        isDarkMode={isDarkMode}
        onUpdateSelection={updateSelection}
        onUpdateChatMessage={updateChatMessage}
        selectedElementIds={selectedElementIds}
        onSetSelectedElementIds={setSelectedElementIds}
        onUndo={undo}
        onRedo={redo}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        fillColor={fillColor}
      />

      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        isConnected={isConnected}
        activeCount={activeParticipantCount}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        strokeColor={strokeColor}
        onSelectColor={handleSelectColor}
        strokeWidth={strokeWidth}
        onSelectStrokeWidth={handleSelectStrokeWidth}
        fillColor={fillColor}
        onSelectFillColor={handleSelectFillColor}
        showStyleBar={showStyleBar}
      />
    </main>
  );
}
