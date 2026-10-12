-- One logo per faction, drawn on level 0 combat cards.
CREATE TABLE faction_logos (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
