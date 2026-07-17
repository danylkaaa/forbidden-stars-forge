CREATE TABLE card_types (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  description        TEXT NOT NULL DEFAULT '',
  constraints        TEXT NOT NULL DEFAULT '',
  template_path      TEXT,
  openai_file_id     TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
