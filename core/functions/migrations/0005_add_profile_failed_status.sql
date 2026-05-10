-- Migration number: 0005 	 2026-05-10T22:30:00.000Z
-- Adds profile_failed status to the sessions table CHECK constraint
-- SQLite doesn't support ALTER CHECK, so recreate the table

CREATE TABLE IF NOT EXISTS sessions_new (
  token            TEXT PRIMARY KEY,
  status           TEXT NOT NULL DEFAULT 'collecting'
                    CHECK(status IN ('collecting', 'building_profile', 'ready', 'error', 'profile_failed')),
  selfie_count     INTEGER NOT NULL DEFAULT 0,
  moodboard_count  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sessions_new (token, status, selfie_count, moodboard_count, created_at, updated_at)
SELECT token, status, selfie_count, moodboard_count, created_at, updated_at FROM sessions;

DROP TABLE sessions;

ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
