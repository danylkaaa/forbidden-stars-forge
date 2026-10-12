ALTER TABLE assembly_templates ADD COLUMN logo_path TEXT NOT NULL DEFAULT '';
ALTER TABLE assembly_templates ADD COLUMN logo_scale REAL NOT NULL DEFAULT 0.5;
