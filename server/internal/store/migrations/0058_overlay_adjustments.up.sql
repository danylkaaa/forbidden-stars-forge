CREATE TABLE overlay_adjustments (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  overlay TEXT NOT NULL,
  adjust TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, overlay)
);
