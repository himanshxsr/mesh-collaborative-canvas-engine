'use client';

import React, { useState } from 'react';
import {
  MousePointer,
  Hand,
  Pencil,
  Type,
  StickyNote,
  Square,
  Circle,
  Diamond,
  Eraser,
  ArrowUpRight,
  Undo2,
  Redo2,
  Download,
  Sun,
  Moon,
  ChevronDown
} from 'lucide-react';

export type ToolType =
  | 'select'
  | 'hand'
  | 'pen'
  | 'text'
  | 'sticky'
  | 'card'
  | 'ellipse'
  | 'diamond'
  | 'eraser'
  | 'connector';

export interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isConnected: boolean;
  activeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  strokeColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: number;
  onSelectStrokeWidth: (width: number) => void;
  fillColor: string;
  onSelectFillColor: (fill: string) => void;
  showStyleBar: boolean;
}

const PALETTE_COLORS = [
  { hex: '#0f172a', name: 'Graphite' },
  { hex: '#2563eb', name: 'Linear Blue' },
  { hex: '#059669', name: 'Emerald' },
  { hex: '#d97706', name: 'Amber' },
  { hex: '#e11d48', name: 'Rose' },
  { hex: '#7c3aed', name: 'Violet' }
];

const STROKE_WIDTHS = [
  { value: 2, label: 'Thin (2px)' },
  { value: 4, label: 'Medium (4px)' },
  { value: 8, label: 'Thick (8px)' }
];

export function Toolbar({
  activeTool,
  onSelectTool,
  isDarkMode,
  onToggleTheme,
  isConnected,
  activeCount,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportPng,
  onExportSvg,
  strokeColor,
  onSelectColor,
  strokeWidth,
  onSelectStrokeWidth,
  fillColor,
  onSelectFillColor,
  showStyleBar
}: ToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const tools: Array<{ id: ToolType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'select', label: 'Select (V)', icon: MousePointer },
    { id: 'hand', label: 'Pan (H / Space)', icon: Hand },
    { id: 'pen', label: 'Pen (P)', icon: Pencil },
    { id: 'text', label: 'Text (T)', icon: Type },
    { id: 'sticky', label: 'Sticky Note (S)', icon: StickyNote },
    { id: 'card', label: 'Architecture Card (C)', icon: Square },
    { id: 'ellipse', label: 'Ellipse (O)', icon: Circle },
    { id: 'diamond', label: 'Diamond Node (D)', icon: Diamond },
    { id: 'connector', label: 'Connector (L)', icon: ArrowUpRight },
    { id: 'eraser', label: 'Eraser (E)', icon: Eraser }
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {/* Contextual Style Bar */}
      {showStyleBar && (
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181b24] border border-[#e2e8f0] dark:border-[#272b37] shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2">
          {/* Color Palette */}
          <div className="flex items-center gap-1 border-r border-[#e2e8f0] dark:border-[#272b37] pr-3">
            {PALETTE_COLORS.map((col) => {
              const activeHex = col.hex === '#0f172a' && isDarkMode ? '#f1f5f9' : col.hex;
              const isSelected = strokeColor === col.hex || (strokeColor === '#0f172a' && col.hex === '#0f172a');
              return (
                <button
                  key={col.hex}
                  onClick={() => onSelectColor(col.hex)}
                  title={col.name}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    isSelected ? 'scale-125 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-[#181b24]' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: activeHex }}
                />
              );
            })}
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-1 border-r border-[#e2e8f0] dark:border-[#272b37] pr-3">
            {STROKE_WIDTHS.map((sw) => (
              <button
                key={sw.value}
                onClick={() => onSelectStrokeWidth(sw.value)}
                title={sw.label}
                className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                  strokeWidth === sw.value
                    ? 'bg-[#2563eb] text-white dark:bg-[#3b82f6]'
                    : 'text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37]'
                }`}
              >
                {sw.value}px
              </button>
            ))}
          </div>

          {/* Fill Style Options */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSelectFillColor('transparent')}
              className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                fillColor === 'transparent'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-[#e2e8f0] dark:border-[#272b37] text-[#0f172a] dark:text-[#f1f5f9]'
              }`}
            >
              Outline
            </button>
            <button
              onClick={() => onSelectFillColor('tint')}
              className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                fillColor !== 'transparent'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-[#e2e8f0] dark:border-[#272b37] text-[#0f172a] dark:text-[#f1f5f9]'
              }`}
            >
              20% Tint
            </button>
          </div>
        </div>
      )}

      {/* Main Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#181b24] border border-[#e2e8f0] dark:border-[#272b37] shadow-xl backdrop-blur-md">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 border-r border-[#e2e8f0] dark:border-[#272b37] pr-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
              canUndo
                ? 'text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37]'
                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
            className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
              canRedo
                ? 'text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37]'
                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Tools */}
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
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        {/* Export Dropdown */}
        <div className="relative border-r border-[#e2e8f0] dark:border-[#272b37] pr-2">
          <button
            onClick={() => setShowExportMenu((prev) => !prev)}
            title="Export Canvas"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {showExportMenu && (
            <div className="absolute bottom-full mb-2 right-0 w-36 rounded-lg bg-white dark:bg-[#181b24] border border-[#e2e8f0] dark:border-[#272b37] shadow-lg py-1 z-50 animate-in fade-in slide-in-from-bottom-2">
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  onExportPng();
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37] transition-colors"
              >
                Export as PNG
              </button>
              <button
                onClick={() => {
                  setShowExportMenu(false);
                  onExportSvg();
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37] transition-colors"
              >
                Export as SVG
              </button>
            </div>
          )}
        </div>

        {/* Theme & Presence */}
        <div className="flex items-center gap-3 pl-1">
          <button
            onClick={onToggleTheme}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2 rounded-lg text-[#0f172a] dark:text-[#f1f5f9] hover:bg-[#f1f5f9] dark:hover:bg-[#272b37] transition-colors"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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
    </div>
  );
}
