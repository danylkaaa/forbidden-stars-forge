-- A card back's own nebula brightness (the event back's); 0 follows the faction's nebula brightness.
ALTER TABLE nebula_placements ADD COLUMN brightness REAL NOT NULL DEFAULT 0 CHECK (brightness = 0 OR (brightness >= 0.2 AND brightness <= 2));
