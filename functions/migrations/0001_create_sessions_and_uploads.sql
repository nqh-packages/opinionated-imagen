-- Migration number: 0001 	 2026-05-09T05:43:04.674Z

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'collecting'
                CHECK(status IN ('collecting', 'building_profile', 'ready', 'error')),
  selfie_count  INTEGER NOT NULL DEFAULT 0,
  moodboard_count INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  id                TEXT PRIMARY KEY,
  session_token     TEXT NOT NULL REFERENCES sessions(token),
  upload_type       TEXT NOT NULL CHECK(upload_type IN ('selfie', 'moodboard')),
  r2_key            TEXT NOT NULL,
  original_filename TEXT,
  content_type      TEXT,
  size_bytes        INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_uploads_session_token ON uploads(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
