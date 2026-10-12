-- Positions of overlay-bound layers (resources, level badge, faction logo)
-- for cards using this subtype; partial assembly layout JSON.
ALTER TABLE card_subtypes ADD COLUMN layout TEXT NOT NULL DEFAULT '{}';
