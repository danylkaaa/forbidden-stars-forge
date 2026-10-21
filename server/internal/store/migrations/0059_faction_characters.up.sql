-- One character picture per faction, sent to OpenAI as a reference when its faction card is generated.
-- openai_file_id is the picture uploaded through the Files API; NULL until it is synced.
CREATE TABLE faction_characters (
  faction_id INTEGER PRIMARY KEY REFERENCES factions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  openai_file_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
