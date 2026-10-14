-- Positions and sizes of the faction card's elements, shared by every faction
-- (edited on the Card Types page). A single row.
CREATE TABLE faction_card_layout (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  layout TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
