-- Look of the nebula on a faction's event card back. `color` is empty when it
-- follows the card back's own colour; `seed` picks the cloud pattern.
CREATE TABLE faction_nebulas (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  color TEXT NOT NULL DEFAULT '',
  seed INTEGER NOT NULL DEFAULT 7,
  density REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
