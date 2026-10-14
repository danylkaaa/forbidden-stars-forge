-- One-off: combat cards are rebuilt around the starting / non-starting split,
-- so the existing ones are dropped (their assemblies go with them through the
-- foreign key; leftover artwork files are removed on startup).
DELETE FROM cards WHERE category = 'combat';
