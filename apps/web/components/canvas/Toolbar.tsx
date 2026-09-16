'use client';

import React from 'react';
import {
  MousePointer,
  Hand,
  Pencil,
  StickyNote,
  Square,
  ArrowUpRight,
  Sun,
  Moon
} from 'lucide-react';

export type ToolType = 'select' | 'hand' | 'pen' | 'sticky' | 'card' | 'connector';

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isConnected: boolean;
  activeCount: number;
}

export function Toolbar({
  activeTool,
  onSelectTool,
  isDarkMode,
  onToggleTheme,
  isConnected,
  activeCount
}: ToolbarProps) {
  const tools: Array<{ id: ToolType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'select', label: 'Select (V)', icon: MousePointer },
    { id: 'hand', label: 'Pan (H / Space)', icon: Hand },
    { id: 'pen', label: 'Pen (P)', icon: Pencil },
    { id: 'sticky', label: 'Sticky Note (N)', icon: StickyNote },
    { id: 'card', label: 'Card (C)', icon: Square },
    { id: 'connector', label: 'Connector (L)', icon: ArrowUpRight }
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#181b24] border border-[#e2e8f0] dark:border-[#272b37] shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-1 border-r border-[#e2e8f0] dark:border-[#272b37] pr-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              title={tool.label}
              className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                isActive
                  ? 'bg-[#2563eb] text-white dark:bg-[#3b82f6]'
                  : 'text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37]'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pl-2">
        <button
          onClick={onToggleTheme}
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-lg text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37] transition-colors"
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2 text-xs text-[#0f172a] dark:text-[#f1f5f9] font-medium border-l border-[#e2e8f0] dark:border-[#272b37] pl-3">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span>{isConnected ? `${activeCount} online` : 'Connecting...'}</span>
        </div>
      </div>
    </div>
  );
}
