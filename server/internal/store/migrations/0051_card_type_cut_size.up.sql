-- The finished (cut) size of a card, in millimetres: used for the cutting lines and the sheet layout when printing.
ALTER TABLE card_types ADD COLUMN card_width_mm REAL NOT NULL DEFAULT 63.5;
ALTER TABLE card_types ADD COLUMN card_height_mm REAL NOT NULL DEFAULT 88;
UPDATE card_types SET card_width_mm = 258, card_height_mm = 170 WHERE name IN ('faction card', 'faction card back');
