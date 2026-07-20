CREATE TABLE batches (
  id               INTEGER PRIMARY KEY,
  openai_batch_id  TEXT,
  mode             TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','final')),
  status           TEXT NOT NULL CHECK (status IN ('created','submitted','in_progress','completed','failed','cancelled')),
  jsonl_path       TEXT NOT NULL,
  output_path      TEXT,
  total_cost_usd   REAL,
  submitted_at     TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE batch_items (
  id             INTEGER PRIMARY KEY,
  batch_id       INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  faction_id     INTEGER NOT NULL REFERENCES factions(id),
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id),
  custom_id      TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
  image_path     TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,
  error          TEXT
);
