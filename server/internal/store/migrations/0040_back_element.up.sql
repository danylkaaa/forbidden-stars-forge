-- The ornament chosen for a faction's back of a card type (a library image
-- key); empty means none.
ALTER TABLE nebula_placements ADD COLUMN element_key TEXT NOT NULL DEFAULT '';
