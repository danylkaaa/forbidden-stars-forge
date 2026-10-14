-- Where a card type's back shows the faction's nebula: its offset from the
-- centre (as a share of the nebula area) and its turn in degrees.
CREATE TABLE nebula_placements (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  rotation REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, category)
);
