-- The faction logo's size on a card type's back, per faction (kept with the
-- nebula placement, which is also per faction and card type).
ALTER TABLE nebula_placements ADD COLUMN logo_scale REAL NOT NULL DEFAULT 0.5 CHECK (logo_scale >= 0.05 AND logo_scale <= 1);
