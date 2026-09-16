-- infra/migrations/001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(128) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canvas_snapshots (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  snapshot_index BIGINT NOT NULL,
  document_state BYTEA NOT NULL,
  elements_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_room_snapshot_index UNIQUE (room_id, snapshot_index)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_room_order
  ON canvas_snapshots (room_id, snapshot_index DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_elements_gin
  ON canvas_snapshots USING gin (elements_json);
