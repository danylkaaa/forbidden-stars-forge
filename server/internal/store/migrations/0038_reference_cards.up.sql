-- Pictures of real or sample cards, kept per card category to compare against
-- while editing. Shared by every faction.
CREATE TABLE reference_cards (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('combat', 'schema', 'upgrade')),
  name TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
