-- Combat cards are starting cards only when flagged; level 0 alone no longer means starting.
ALTER TABLE cards ADD COLUMN starting INTEGER NOT NULL DEFAULT 0 CHECK (starting IN (0, 1));
