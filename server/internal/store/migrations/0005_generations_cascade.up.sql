-- generations rows are disposable test-run artifacts (PRD §7.1): only
-- batch-item references should ever block a delete (M5). generations was
-- created in 0004 with plain REFERENCES (ON DELETE NO ACTION), so deleting
-- a faction or card type that has any generation raised a raw FK-constraint
-- 500. SQLite has no ALTER TABLE ... ALTER CONSTRAINT, so rebuild the table
-- with ON DELETE CASCADE on both FKs, per the standard 12-step procedure.
CREATE TABLE generations_new (
  id             INTEGER PRIMARY KEY,
  faction_id     INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','final')),
  prompt         TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
  image_path     TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,
  duration_ms    INTEGER,
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO generations_new SELECT * FROM generations;

DROP TABLE generations;

ALTER TABLE generations_new RENAME TO generations;
