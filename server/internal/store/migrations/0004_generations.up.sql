CREATE TABLE generations (
  id             INTEGER PRIMARY KEY,
  faction_id     INTEGER NOT NULL REFERENCES factions(id),
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id),
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
