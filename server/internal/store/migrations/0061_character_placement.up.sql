-- Where a faction's character is pasted on the faction card template sent to OpenAI (JSON {x, y, scale}:
-- centre in fractions of the template, height as a fraction of its height; empty = the default place), and the
-- last such template uploaded to OpenAI with the key it was made from, so an unchanged one is not sent again.
ALTER TABLE faction_characters ADD COLUMN placement TEXT NOT NULL DEFAULT '';
ALTER TABLE faction_characters ADD COLUMN composite_key TEXT NOT NULL DEFAULT '';
ALTER TABLE faction_characters ADD COLUMN composite_file_id TEXT NOT NULL DEFAULT '';
