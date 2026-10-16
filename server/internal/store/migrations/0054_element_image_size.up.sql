-- Elements are not cards: they have an AI image size of their own (3:1), unless one was already chosen.
UPDATE card_types SET image_size = '1536x512' WHERE name IN ('back element', 'event element') AND image_size = '';
