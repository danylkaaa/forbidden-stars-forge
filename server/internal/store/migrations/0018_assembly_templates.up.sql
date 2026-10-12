-- The generated image every card of a faction and category is assembled on.
CREATE TABLE assembly_templates (
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  image_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, category)
);
