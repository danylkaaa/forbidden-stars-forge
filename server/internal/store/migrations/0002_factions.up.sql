CREATE TABLE factions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  dlc          TEXT NOT NULL CHECK (dlc IN ('Galaxy in Flames', 'Symphony of War', 'Darkest Dawn')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE faction_revisions (
  id           INTEGER PRIMARY KEY,
  faction_id   INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  dlc          TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('manual','claude','rollback')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
