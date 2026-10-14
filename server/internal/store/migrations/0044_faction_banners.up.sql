-- A faction's banner is assembled once, in its settings: the frame with the
-- logo inside it and an ornament over the frame's edges. Combat and upgrade
-- card backs draw it at the size set on the card template.
CREATE TABLE faction_banners (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  logo_scale REAL NOT NULL DEFAULT 0.5 CHECK (logo_scale >= 0.05 AND logo_scale <= 1),
  element_key TEXT NOT NULL DEFAULT '',
  element_x REAL NOT NULL DEFAULT 0 CHECK (element_x >= -1 AND element_x <= 1),
  element_y REAL NOT NULL DEFAULT 0 CHECK (element_y >= -1 AND element_y <= 1),
  element_scale REAL NOT NULL DEFAULT 0.42 CHECK (element_scale >= 0.05 AND element_scale <= 1.5),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- What a faction had on its combat back becomes its banner: the logo size, the element, and the
-- element's position the combat card template held.
INSERT INTO faction_banners(faction_id, logo_scale, element_key, element_x, element_y, element_scale)
SELECT p.faction_id, p.logo_scale, p.element_key,
  COALESCE((SELECT json_extract(layout, '$.back.element_x') FROM card_type_layouts WHERE category = 'combat'), 0),
  COALESCE((SELECT json_extract(layout, '$.back.element_y') FROM card_type_layouts WHERE category = 'combat'), 0),
  COALESCE((SELECT json_extract(layout, '$.back.element_scale') FROM card_type_layouts WHERE category = 'combat'), 0.42)
FROM nebula_placements p WHERE p.category = 'combat';
-- How much larger or smaller than the template's banner size this faction's back draws it.
ALTER TABLE nebula_placements ADD COLUMN banner_scale REAL NOT NULL DEFAULT 1 CHECK (banner_scale >= 0.2 AND banner_scale <= 3);
