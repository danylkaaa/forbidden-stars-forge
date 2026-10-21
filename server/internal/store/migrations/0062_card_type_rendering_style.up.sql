-- The first line of an image type's Rendering prompt section (its art style); empty = "Photorealistic style.".
ALTER TABLE card_types ADD COLUMN rendering_style TEXT NOT NULL DEFAULT '';
