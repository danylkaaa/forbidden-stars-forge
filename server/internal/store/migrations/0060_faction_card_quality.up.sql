-- The faction card's final quality (high, xhigh or max); empty = the final quality. Settings are only
-- updated, never inserted, so the key must exist.
INSERT OR IGNORE INTO settings (key, value) VALUES ('faction_card_quality', '');
