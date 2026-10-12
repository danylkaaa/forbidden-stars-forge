CREATE TABLE assembly_layouts (
  template_key TEXT NOT NULL,
  faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  card_type_id INTEGER NOT NULL,
  layout TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (template_key, faction_id, card_type_id)
);

-- Keep the most recently saved layout when cards already share a template.
INSERT OR REPLACE INTO assembly_layouts(template_key, faction_id, card_type_id, layout, updated_at)
SELECT CASE WHEN a.image_key = 'upload' THEN 'upload:' || replace(a.artwork_path, 'card-artwork/', '') ELSE a.image_key END,
       c.faction_id,
       CASE WHEN a.overlay_id NOT IN ('auto', 'none') THEN CAST(a.overlay_id AS INTEGER)
            ELSE COALESCE(g.card_type_id, b.card_type_id, 0) END,
       a.layout, a.updated_at
FROM card_assemblies a
JOIN cards c ON c.id = a.card_id
LEFT JOIN generations g ON a.image_key = 'test-' || g.id
LEFT JOIN batch_items b ON a.image_key = 'batch-' || b.id
WHERE a.image_key != '' AND a.layout != '{}'
ORDER BY a.updated_at, a.card_id;
