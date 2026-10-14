-- One card back for combat and event cards: the combat back type is renamed
-- "card back", and the events back and upgrade back types are folded into it
-- (their images move to it, so nothing generated is lost) and removed. The
-- upgrade back is a bundled texture; the upgrade element type is created by
-- the server on startup.
UPDATE card_types SET name = 'card back' WHERE name = 'combat back' AND NOT EXISTS (SELECT 1 FROM card_types WHERE name = 'card back');
UPDATE generations SET card_type_id = (SELECT id FROM card_types WHERE name = 'card back')
  WHERE EXISTS (SELECT 1 FROM card_types WHERE name = 'card back')
    AND card_type_id IN (SELECT id FROM card_types WHERE name IN ('events back', 'upgrade back'));
UPDATE batch_items SET card_type_id = (SELECT id FROM card_types WHERE name = 'card back')
  WHERE EXISTS (SELECT 1 FROM card_types WHERE name = 'card back')
    AND card_type_id IN (SELECT id FROM card_types WHERE name IN ('events back', 'upgrade back'));
DELETE FROM card_types WHERE name IN ('events back', 'upgrade back')
  AND NOT EXISTS (SELECT 1 FROM generations WHERE card_type_id = card_types.id)
  AND NOT EXISTS (SELECT 1 FROM batch_items WHERE card_type_id = card_types.id);

-- The element type for card backs is called "back element" (it serves combat and upgrade backs).
UPDATE card_types SET name = 'back element' WHERE name = 'upgrade element';
