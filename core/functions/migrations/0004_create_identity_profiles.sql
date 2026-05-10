-- Migration number: 0004 	 2026-05-10T22:00:00.000Z
-- Creates identity_profiles table for storing vision extraction results

CREATE TABLE IF NOT EXISTS identity_profiles (
  session_token    TEXT PRIMARY KEY REFERENCES sessions(token),
  description      TEXT NOT NULL,
  reference_r2_key TEXT,
  model_used       TEXT NOT NULL DEFAULT 'gemma-4-26b-a4b-it',
  extraction_ms    INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
