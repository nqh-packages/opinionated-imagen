-- Migration number: 0006 2026-05-13T08:45:00.000Z
-- Adds Creator-owned profile, Pack, and Contact Sheet runtime state for the MVP path.

ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id);

ALTER TABLE uploads ADD COLUMN user_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);

CREATE TABLE IF NOT EXISTS style_profiles (
  session_token    TEXT PRIMARY KEY REFERENCES sessions(token),
  description      TEXT NOT NULL,
  model_used       TEXT NOT NULL DEFAULT 'gemma-4-26b-a4b-it',
  extraction_ms    INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS packs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  session_token   TEXT NOT NULL REFERENCES sessions(token),
  preset_id       TEXT NOT NULL,
  intention_json  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK(status IN ('processing', 'ready', 'error')),
  provider_route  TEXT NOT NULL DEFAULT 'cloudflare-ai-gateway:gpt-image-2',
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_packs_user_id ON packs(user_id);
CREATE INDEX IF NOT EXISTS idx_packs_session_token ON packs(session_token);
CREATE INDEX IF NOT EXISTS idx_packs_status ON packs(status);

CREATE TABLE IF NOT EXISTS contact_sheets (
  id              TEXT PRIMARY KEY,
  pack_id         TEXT NOT NULL REFERENCES packs(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'processing'
                  CHECK(status IN ('processing', 'ready', 'error')),
  artifact_r2_key TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_sheets_pack_id ON contact_sheets(pack_id);
CREATE INDEX IF NOT EXISTS idx_contact_sheets_user_id ON contact_sheets(user_id);
