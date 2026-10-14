-- Upgrade cards now have a level and a resource price like combat cards, and
-- their order is deploy / advance / strategize / dominate (was "upgrade").
-- SQLite cannot alter a CHECK, so the table is rebuilt. Dropping cards would
-- cascade into card_assemblies, so those rows are parked and restored.
CREATE TABLE card_assemblies_parked AS SELECT * FROM card_assemblies;
CREATE TABLE cards_new (
  id INTEGER PRIMARY KEY,
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  category TEXT NOT NULL CHECK(category IN ('combat','schema','upgrade')),
  level INTEGER, resource_cost INTEGER, shields INTEGER, guns INTEGER, eagles INTEGER,
  upper_text TEXT, lower_text TEXT, subtype TEXT, text TEXT, action TEXT, upgrade_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (category = 'combat' AND level IS NOT NULL AND level BETWEEN 0 AND 3
      AND resource_cost IS NOT NULL AND resource_cost BETWEEN 0 AND 9007199254740991
      AND shields IS NOT NULL AND shields BETWEEN 0 AND 9007199254740991
      AND guns IS NOT NULL AND guns BETWEEN 0 AND 9007199254740991
      AND eagles IS NOT NULL AND eagles BETWEEN 0 AND 9007199254740991
      AND upper_text IS NOT NULL AND lower_text IS NOT NULL
      AND subtype IS NULL AND text IS NULL AND action IS NULL AND upgrade_type IS NULL)
    OR (category = 'schema' AND subtype IS NOT NULL AND subtype IN ('schema','tactic')
      AND text IS NOT NULL AND action IS NOT NULL
      AND action IN ('rotate_clockwise','rotate_counterclockwise','move_vertical','move_horizontal')
      AND level IS NULL AND resource_cost IS NULL AND shields IS NULL AND guns IS NULL AND eagles IS NULL
      AND upper_text IS NULL AND lower_text IS NULL AND upgrade_type IS NULL)
    OR (category = 'upgrade' AND upgrade_type IS NOT NULL AND upgrade_type IN ('deploy','advance','strategize','dominate')
      AND text IS NOT NULL
      AND level IS NOT NULL AND level BETWEEN 0 AND 3
      AND resource_cost IS NOT NULL AND resource_cost BETWEEN 0 AND 9007199254740991
      AND shields IS NULL AND guns IS NULL AND eagles IS NULL
      AND upper_text IS NULL AND lower_text IS NULL AND subtype IS NULL AND action IS NULL)
  )
);
INSERT INTO cards_new(id, faction_id, name, category, level, resource_cost, shields, guns, eagles, upper_text, lower_text, subtype, text, action, upgrade_type, created_at, updated_at)
SELECT id, faction_id, name, category,
  CASE WHEN category = 'upgrade' THEN 1 ELSE level END,
  CASE WHEN category = 'upgrade' THEN 0 ELSE resource_cost END,
  shields, guns, eagles, upper_text, lower_text, subtype, text, action,
  CASE WHEN category = 'upgrade' AND upgrade_type = 'upgrade' THEN 'dominate' ELSE upgrade_type END,
  created_at, updated_at
FROM cards;
DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;
CREATE INDEX cards_faction_category ON cards(faction_id, category);
INSERT INTO card_assemblies SELECT * FROM card_assemblies_parked;
DROP TABLE card_assemblies_parked;
