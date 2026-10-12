-- User-defined subtypes of each card category, each with an ordered stack
-- of overlay images (position 0 is drawn first, i.e. at the bottom).
CREATE TABLE card_subtypes (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category, name)
);
CREATE TABLE subtype_overlays (
  id INTEGER PRIMARY KEY,
  subtype_id INTEGER NOT NULL REFERENCES card_subtypes(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 0 = no subtype; a deleted subtype also renders as none.
ALTER TABLE card_assemblies ADD COLUMN subtype_id INTEGER NOT NULL DEFAULT 0;
