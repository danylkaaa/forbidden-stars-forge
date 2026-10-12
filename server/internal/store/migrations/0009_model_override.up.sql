-- Model actually used per generation / batch (the Settings model is only the
-- default). '' on old rows means "unknown — whatever the default was".
ALTER TABLE generations ADD COLUMN model TEXT NOT NULL DEFAULT '';
ALTER TABLE batches ADD COLUMN model TEXT NOT NULL DEFAULT '';
