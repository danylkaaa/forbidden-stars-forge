INSERT OR IGNORE INTO settings (key, value) VALUES ('image_size', '816x1104');
ALTER TABLE card_types DROP COLUMN image_size;
