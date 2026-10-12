ALTER TABLE card_assemblies ADD COLUMN logo_scale REAL NOT NULL DEFAULT 1 CHECK (logo_scale >= 0.1 AND logo_scale <= 3);
