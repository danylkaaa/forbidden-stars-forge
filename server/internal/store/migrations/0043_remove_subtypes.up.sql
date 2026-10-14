-- Subtypes (user-made variants of a card category with their own uploaded overlay
-- images) are gone: combat cards use the bundled ribbons. The positions their
-- built-in subtypes held (level, price, resource column, logo) move into the
-- combat card type's layout, which now holds every layer.
INSERT OR IGNORE INTO card_type_layouts(category, layout) VALUES ('combat', '{}');
UPDATE card_type_layouts SET layout = json_patch(json_patch(layout,
    COALESCE((SELECT layout FROM card_subtypes WHERE category = 'combat' AND name = 'Level 0'), '{}')),
    COALESCE((SELECT layout FROM card_subtypes WHERE category = 'combat' AND name = 'Level 1+'), '{}'))
  WHERE category = 'combat';
DROP TABLE subtype_overlays;
DROP TABLE card_subtypes;
ALTER TABLE card_assemblies DROP COLUMN subtype_id;
