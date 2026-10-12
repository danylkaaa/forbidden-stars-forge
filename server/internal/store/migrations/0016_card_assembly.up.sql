CREATE TABLE card_assemblies (
  card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL DEFAULT '',
  artwork_path TEXT NOT NULL DEFAULT '',
  overlay_id TEXT NOT NULL DEFAULT 'auto',
  transform TEXT NOT NULL DEFAULT '{"scale":1,"x":0,"y":0}',
  layout TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
