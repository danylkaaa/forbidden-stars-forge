CREATE TABLE card_subtypes (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  layout TEXT NOT NULL DEFAULT '{}',
  UNIQUE (category, name)
);
CREATE TABLE subtype_overlays (
  id INTEGER PRIMARY KEY,
  subtype_id INTEGER NOT NULL REFERENCES card_subtypes(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE card_assemblies ADD COLUMN subtype_id INTEGER NOT NULL DEFAULT 0;
