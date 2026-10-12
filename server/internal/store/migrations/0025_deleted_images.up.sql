-- Keep generation IDs, numbering and cost records after deleting an experiment.
ALTER TABLE generations ADD COLUMN deleted_at TEXT NOT NULL DEFAULT '';
ALTER TABLE batch_items ADD COLUMN deleted_at TEXT NOT NULL DEFAULT '';
