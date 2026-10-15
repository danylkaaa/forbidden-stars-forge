-- Batch processing is removed. Finished batch images become regular generations
-- (same image files), cards and templates that pointed at them are re-keyed, and
-- the batch tables are dropped.
CREATE TABLE batch_image_map AS
SELECT i.id AS old_id,
       (SELECT COALESCE(MAX(id), 0) FROM generations) + ROW_NUMBER() OVER (ORDER BY i.id) AS new_id
FROM batch_items i WHERE i.status = 'done' AND i.deleted_at = '' AND COALESCE(i.image_path, '') <> '';

INSERT INTO generations (id, faction_id, card_type_id, mode, prompt, status, image_path, input_tokens, output_tokens, cost_usd,
                         model, quality, name, favorite, created_at)
SELECT m.new_id, i.faction_id, i.card_type_id, b.mode, '', 'done', i.image_path, i.input_tokens, i.output_tokens, i.cost_usd,
       b.model, i.quality, i.name, i.favorite, COALESCE(b.completed_at, b.created_at)
FROM batch_items i JOIN batch_image_map m ON m.old_id = i.id JOIN batches b ON b.id = i.batch_id;

UPDATE assembly_templates SET image_key = 'test-' || (SELECT new_id FROM batch_image_map WHERE 'batch-' || old_id = image_key)
WHERE image_key LIKE 'batch-%' AND EXISTS (SELECT 1 FROM batch_image_map WHERE 'batch-' || old_id = image_key);
UPDATE card_assemblies SET image_key = 'test-' || (SELECT new_id FROM batch_image_map WHERE 'batch-' || old_id = image_key)
WHERE image_key LIKE 'batch-%' AND EXISTS (SELECT 1 FROM batch_image_map WHERE 'batch-' || old_id = image_key);

UPDATE generations SET parent_id = COALESCE((SELECT new_id FROM batch_image_map WHERE old_id = parent_id), 0),
                       parent_kind = CASE WHEN EXISTS (SELECT 1 FROM batch_image_map WHERE old_id = parent_id) THEN 'generation' ELSE '' END,
                       parent_batch_id = 0
WHERE parent_kind = 'batch-item';

DROP TABLE batch_image_map;
DROP TABLE batch_items;
DROP TABLE batches;
