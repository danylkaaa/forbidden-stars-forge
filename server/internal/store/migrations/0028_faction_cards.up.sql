-- One faction card (front and back) per faction. `data` holds its text,
-- unit stats, initial forces and objectives as JSON; the generated front and
-- back images are library images chosen by key.
CREATE TABLE faction_cards (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  front_image_key TEXT NOT NULL DEFAULT '',
  back_image_key TEXT NOT NULL DEFAULT '',
  unit_color TEXT NOT NULL DEFAULT '#8e3a8a',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Uploaded files: unit STL models and icon overrides, objective images, the
-- back portrait, and (faction_id 0) the default structure/resource icons.
CREATE TABLE faction_card_assets (
  faction_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  path TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (faction_id, key)
);
CREATE TRIGGER faction_card_assets_cleanup AFTER DELETE ON factions
BEGIN
  DELETE FROM faction_card_assets WHERE faction_id = OLD.id;
END;
