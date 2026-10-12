CREATE TABLE cards (
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
    OR (category = 'upgrade' AND upgrade_type IS NOT NULL AND upgrade_type IN ('deploy','advance','strategize','upgrade')
      AND text IS NOT NULL AND level IS NULL AND resource_cost IS NULL AND shields IS NULL AND guns IS NULL AND eagles IS NULL
      AND upper_text IS NULL AND lower_text IS NULL AND subtype IS NULL AND action IS NULL)
  )
);
CREATE INDEX cards_faction_category ON cards(faction_id, category);
