-- A card type can be generated without a template image: its prompt alone makes the picture.
-- Dropping the template sets this, so the built-in templates are not made again.
ALTER TABLE card_types ADD COLUMN no_template INTEGER NOT NULL DEFAULT 0 CHECK (no_template IN (0, 1));
