-- Reference pictures are kept per card type and per side, and also for the
-- faction card: the table is rebuilt for the wider check.
CREATE TABLE reference_cards_new (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade', 'faction')),
  side TEXT NOT NULL DEFAULT 'front' CHECK (side IN ('front', 'back')),
  name TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO reference_cards_new(id, category, side, name, path, created_at) SELECT id, category, 'front', name, path, created_at FROM reference_cards;
DROP TABLE reference_cards;
ALTER TABLE reference_cards_new RENAME TO reference_cards;
