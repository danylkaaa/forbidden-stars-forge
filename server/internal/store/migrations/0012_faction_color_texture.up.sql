-- Structured faction style: primary color and texture/material, alongside
-- the free-form description ("rest of the description").
ALTER TABLE factions ADD COLUMN primary_color TEXT NOT NULL DEFAULT '';
ALTER TABLE factions ADD COLUMN texture TEXT NOT NULL DEFAULT '';
ALTER TABLE faction_revisions ADD COLUMN primary_color TEXT NOT NULL DEFAULT '';
ALTER TABLE faction_revisions ADD COLUMN texture TEXT NOT NULL DEFAULT '';
