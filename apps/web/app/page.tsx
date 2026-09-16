'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [roomIdInput, setRoomIdInput] = useState('');

  const handleCreateRoom = () => {
    const newRoomId = crypto.randomUUID().substring(0, 8);
    router.push(`/canvas/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      router.push(`/canvas/${roomIdInput.trim()}`);
    }
  };

  return (
    <main className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#0c0e12] text-[#f1f5f9] p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="z-10 max-w-xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181b24] border border-[#272b37] text-xs text-blue-400 font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Real-time Yjs CRDT Vector Engine</span>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Mesh Collaborative Canvas
          </h1>
          <p className="text-[#94a3b8] text-base leading-relaxed">
            High-performance, low-latency visual collaboration engine built with 60Hz vector rendering and tiered snapshot storage.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-[#181b24] border border-[#272b37] shadow-2xl space-y-6">
          <button
            onClick={handleCreateRoom}
            className="w-full py-3.5 px-6 rounded-xl bg-[#3b82f6] hover:bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-blue-500/20"
          >
            <span>Create New Canvas Room</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-[#272b37]" />
            <span className="flex-shrink mx-4 text-xs text-[#64748b] uppercase tracking-wider font-medium">
              or join existing
            </span>
            <div className="flex-grow border-t border-[#272b37]" />
          </div>

          <form onSubmit={handleJoinRoom} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter Room ID..."
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl bg-[#0c0e12] border border-[#272b37] text-sm text-[#f1f5f9] placeholder-[#64748b] focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!roomIdInput.trim()}
              className="px-5 py-3 rounded-xl bg-[#272b37] hover:bg-[#334155] text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
