-- Searchable image names "<n>-<faction>-<type>-<quality>" (n counts images
-- per faction × card type across Test Generation and batches), the quality
-- each image was made at, and a favorite flag.
ALTER TABLE generations ADD COLUMN quality TEXT NOT NULL DEFAULT '';
ALTER TABLE generations ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE generations ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE batch_items ADD COLUMN quality TEXT NOT NULL DEFAULT '';
ALTER TABLE batch_items ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE batch_items ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;

-- Backfill quality from the current settings (the best we know).
UPDATE generations SET quality = (SELECT value FROM settings
  WHERE key = CASE generations.mode WHEN 'final' THEN 'final_quality' ELSE 'draft_quality' END);
UPDATE batch_items SET quality = (SELECT value FROM settings
  WHERE key = CASE (SELECT mode FROM batches WHERE batches.id = batch_items.batch_id)
              WHEN 'final' THEN 'final_quality' ELSE 'draft_quality' END);

-- Backfill names, numbering each faction × card type pair by creation time.
CREATE TEMP TABLE image_numbers AS
SELECT src, id, ROW_NUMBER() OVER (PARTITION BY faction_id, card_type_id ORDER BY at, src, id) AS n
FROM (
  SELECT 'g' AS src, id, faction_id, card_type_id, created_at AS at FROM generations
  UNION ALL
  SELECT 'b', i.id, i.faction_id, i.card_type_id, b.created_at
  FROM batch_items i JOIN batches b ON b.id = i.batch_id
);

UPDATE generations SET name = (SELECT n FROM image_numbers WHERE src = 'g' AND image_numbers.id = generations.id)
  || '-' || (SELECT lower(replace(replace(trim(name), ' ', '_'), '-', '_')) FROM factions WHERE factions.id = generations.faction_id)
  || '-' || (SELECT lower(replace(replace(trim(name), ' ', '_'), '-', '_')) FROM card_types WHERE card_types.id = generations.card_type_id)
  || '-' || quality;
UPDATE batch_items SET name = (SELECT n FROM image_numbers WHERE src = 'b' AND image_numbers.id = batch_items.id)
  || '-' || (SELECT lower(replace(replace(trim(name), ' ', '_'), '-', '_')) FROM factions WHERE factions.id = batch_items.faction_id)
  || '-' || (SELECT lower(replace(replace(trim(name), ' ', '_'), '-', '_')) FROM card_types WHERE card_types.id = batch_items.card_type_id)
  || '-' || quality;

DROP TABLE image_numbers;
