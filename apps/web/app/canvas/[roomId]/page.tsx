'use client';

import React, { useState } from 'react';
import { useSocketSync } from '@/hooks/useSocketSync';
import { usePresence } from '@/hooks/usePresence';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar, ToolType } from '@/components/canvas/Toolbar';

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

  const {
    socket,
    elements,
    isConnected,
    addOrUpdateElement,
    deleteElement
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

  const activeParticipantCount = remotePresences.size + 1;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-canvas-light dark:bg-canvas-dark">
      <InfiniteCanvas
        elements={elements}
        activeTool={activeTool}
        onAddOrUpdateElement={addOrUpdateElement}
        onDeleteElement={deleteElement}
        remotePresences={remotePresences}
        onRegisterPointer={registerPoint}
        userId={userId}
        userName={userName}
        isDarkMode={isDarkMode}
        onUpdateSelection={updateSelection}
        onUpdateChatMessage={updateChatMessage}
      />

      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        isConnected={isConnected}
        activeCount={activeParticipantCount}
      />
    </main>
  );
}
