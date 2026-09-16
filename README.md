# mesh-collaborative-canvas-engine

> **A real-time, Figma-inspired collaborative whiteboard engine** built from scratch to explore distributed systems, CRDT state sync, and high-frequency multiplayer canvas interactions.

A fast, conflict-free collaborative canvas built with Next.js 15, Yjs CRDTs, Socket.io, Redis Streams, and PostgreSQL 16.

---

## What is this?

Think of this as a lightweight, open-source **Figma / tldraw clone** focused on the distributed systems challenges under the hood: handling high-frequency multiplayer drawing without WebSocket buffer bloat, frame drops, or database write lockups.

Instead of broadcasting every raw mouse event or locking database rows on every stroke, it uses:
* **Yjs CRDTs** for deterministic, conflict-free state convergence.
* **60Hz Client Throttling** with Ramer-Douglas-Peucker decimation to keep network frames lightweight.
* **Tiered Storage:** Real-time deltas are logged to **Redis Streams**, while a background worker compiles and flushes state snapshots to **PostgreSQL 16**.

---

## Features (Figma-Inspired)

* **Multiplayer Cursors & Presence:** Live cursor positions with collaborator names and custom color tags.
* **Figma-Style Cursor Chat:** Hit `/` to type quick ephemeral messages that float directly beside your cursor.
* **Peer Selection Outlines:** See colored bounding boxes and name pills around objects your teammates currently have selected.
* **Infinite Viewport:** Focal-preserving zoom (0.15x to 3.0x) and smooth panning (`Space + Drag` or middle click).
* **Vector Inking:** Freehand pen tool with midpoint quadratic Bézier curve smoothing and theme-adaptive ink.
* **Marquee Selection:** Click and drag on empty space to select multiple elements using Axis-Aligned Bounding Box (AABB) intersection.
* **Canvas Primitives:** Markdown-enabled architecture cards, organic sticky notes (1.5° tilt), and dynamic connector arrows.
* **Dual Palette:** Tactile, minimalist design (Warm Stone Light mode and Obsidian Dark mode).

---

## Tech Stack

* **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons
* **CRDT & Sync:** Yjs
* **Backend Gateway:** Node.js, Express, Socket.io, `@socket.io/redis-adapter`
* **Streaming & In-Memory:** Redis 7 (Hashes for presence TTL, Streams for delta logs)
* **Durable Storage:** PostgreSQL 16 (JSONB & binary state snapshots)
* **Local Infra:** Docker Compose

---

## Architecture at a Glance

```
[ Next.js 15 Clients ]
  |
  |  WebSocket (Binary CRDT deltas + 60Hz presence)
  v
[ Socket.io Gateway ] <---> [ Redis Pub/Sub Adapter (Horizontal Scaling) ]
  |
  |  XADD (Append-only delta log)
  v
[ Redis Streams ]
  |
  |  XREADGROUP (Batch read every 60s or 100 deltas)
  v
[ Snapshot Worker ] ---> Compiles Y.Doc in memory ---> [ PostgreSQL 16 ]
```

---

## Quickstart

### Prerequisites
* [Node.js 20+ LTS](https://nodejs.org/)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be running)

### 1. Start Postgres & Redis
```bash
docker compose -f infra/docker-compose.yml up -d
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Services (Choose Option A or Option B)
You will need 3 terminal tabs (one for the Gateway, one for the Snapshot Worker, and one for the Web Client).

#### Option A: Running from the Root Directory (Recommended for Monorepos)
Keeps all terminal tabs anchored in the root folder using npm workspace flags:

```bash
# Terminal 1 — Socket Gateway
npm run dev -w @mesh/server

# Terminal 2 — Snapshot Compactor Worker
npm run dev -w @mesh/worker

# Terminal 3 — Next.js 15 Web App
npm run dev -w @mesh/web
```

#### Option B: Running by Navigating into Each Subfolder
If you prefer running commands inside each individual package directory:

```bash
# Terminal 1 — Socket Gateway
cd apps/server
npm run dev

# Terminal 2 — Snapshot Compactor Worker
cd apps/worker
npm run dev

# Terminal 3 — Next.js 15 Web App
cd apps/web
npm run dev
```

### 4. Test Collaboration
Open http://localhost:3000/canvas/demo in your browser, and open the same link in an Incognito Window to test live multi-user drawing, cursor chat, and presence.
