-- The ornament on a faction's event cards (the strip between the tactic/scheme banner and the text panel):
-- a library image of the "event element" type, with its place and width as shares of the card.
-- One setting per faction, drawn on every event card of it.
CREATE TABLE faction_event_elements (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  element_key TEXT NOT NULL DEFAULT '',
  element_x REAL NOT NULL DEFAULT 0 CHECK (element_x >= -1 AND element_x <= 1),
  element_y REAL NOT NULL DEFAULT 0 CHECK (element_y >= -1 AND element_y <= 1),
  element_scale REAL NOT NULL DEFAULT 0.5 CHECK (element_scale >= 0.05 AND element_scale <= 1.5),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
