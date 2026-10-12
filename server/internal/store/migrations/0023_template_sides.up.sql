-- A faction and category now choose a generated image for the card front
-- (the template cards are assembled on) and for the shared card back.
CREATE TABLE assembly_templates_new (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  side TEXT NOT NULL DEFAULT 'front' CHECK (side IN ('front', 'back')),
  image_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, category, side)
);
INSERT INTO assembly_templates_new(faction_id, category, side, image_key, updated_at)
SELECT faction_id, category, 'front', image_key, updated_at FROM assembly_templates;
DROP TABLE assembly_templates;
ALTER TABLE assembly_templates_new RENAME TO assembly_templates;
