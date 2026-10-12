CREATE TABLE assembly_templates_old (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  image_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, category)
);
INSERT INTO assembly_templates_old(faction_id, category, image_key, updated_at)
SELECT faction_id, category, image_key, updated_at FROM assembly_templates WHERE side = 'front';
DROP TABLE assembly_templates;
ALTER TABLE assembly_templates_old RENAME TO assembly_templates;
