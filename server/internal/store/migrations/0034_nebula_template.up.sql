-- A faction without a generated front template can use its nebula as one.
ALTER TABLE faction_nebulas ADD COLUMN as_template INTEGER NOT NULL DEFAULT 0 CHECK (as_template IN (0, 1));
