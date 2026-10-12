-- Area edits: a generation can be an edit of an earlier image (a
-- generation or a batch item), made with a painted mask + instruction.
ALTER TABLE generations ADD COLUMN parent_kind TEXT NOT NULL DEFAULT '' CHECK (parent_kind IN ('', 'generation', 'batch-item'));
ALTER TABLE generations ADD COLUMN parent_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE generations ADD COLUMN parent_batch_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE generations ADD COLUMN parent_name TEXT NOT NULL DEFAULT '';
ALTER TABLE generations ADD COLUMN edit_instruction TEXT NOT NULL DEFAULT '';
