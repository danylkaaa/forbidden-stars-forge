-- A faction's own colour (#rrggbb), shown in lists and used as the default
-- colour of its nebula. Separate from the free-text primary colour that
-- feeds image prompts.
CREATE TABLE faction_colors (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  color TEXT NOT NULL CHECK (color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
