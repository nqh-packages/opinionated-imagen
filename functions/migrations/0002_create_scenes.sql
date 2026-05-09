-- Migration number: 0002 	 2026-05-09T06:37:39.947Z

CREATE TABLE IF NOT EXISTS scenes (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  tags                  TEXT NOT NULL DEFAULT '[]',
  base_scene            TEXT NOT NULL DEFAULT '',
  composition_plan      TEXT NOT NULL DEFAULT '[]',
  requires_product_image INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
