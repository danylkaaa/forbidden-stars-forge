-- An image type painted around the faction's character: the character is placed on a blank canvas, OpenAI fills
-- the rest, and the character is pasted back unchanged.
ALTER TABLE card_types ADD COLUMN with_character INTEGER NOT NULL DEFAULT 0;
