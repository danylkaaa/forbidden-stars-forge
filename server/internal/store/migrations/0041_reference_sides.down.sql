CREATE TABLE reference_cards_old (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  name TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO reference_cards_old(id, category, name, path, created_at) SELECT id, category, name, path, created_at FROM reference_cards WHERE category <> 'faction';
DROP TABLE reference_cards;
ALTER TABLE reference_cards_old RENAME TO reference_cards;
