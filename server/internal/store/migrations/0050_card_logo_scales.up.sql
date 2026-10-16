-- The size of a faction's logo on its cards, shared by every card of that faction and category.
CREATE TABLE card_logo_scales (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  scale      REAL NOT NULL CHECK (scale >= 0.1 AND scale <= 3),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, category)
);
