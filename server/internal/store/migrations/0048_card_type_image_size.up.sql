-- The AI image size is set per card type (its AI template), no longer globally in Settings.
ALTER TABLE card_types ADD COLUMN image_size TEXT NOT NULL DEFAULT '';
UPDATE card_types SET image_size = COALESCE((SELECT value FROM settings WHERE key = 'image_size'), '');
DELETE FROM settings WHERE key = 'image_size';
