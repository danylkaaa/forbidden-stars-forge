-- Title and rules text positions per card category, shared by every card of
-- that type. Seeded from the most recently saved per-template layout.
CREATE TABLE card_type_layouts (
  category TEXT PRIMARY KEY CHECK (category IN ('combat', 'schema', 'upgrade')),
  layout TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO card_type_layouts(category, layout)
SELECT 'combat', layout FROM assembly_layouts ORDER BY updated_at DESC LIMIT 1;
