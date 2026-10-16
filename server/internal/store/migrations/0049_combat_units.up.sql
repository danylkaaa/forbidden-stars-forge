-- A combat card's lower text is split into the unit names ("units", a JSON array) and the unit text.
-- The unit text stays in the lower_text column. "Skitarii/Light Cruiser: Force ..." becomes
-- units ["Skitarii","Light Cruiser"] and "Force ..."; text without such a short "A/B:" prefix is kept whole.
ALTER TABLE cards ADD COLUMN units TEXT NOT NULL DEFAULT '[]';

CREATE TABLE units_split AS
SELECT id,
       substr(lower_text, 1, instr(lower_text, ':') - 1) AS prefix,
       ltrim(substr(lower_text, instr(lower_text, ':') + 1)) AS rest
FROM cards
WHERE category = 'combat' AND instr(lower_text, ':') > 1
  AND instr(lower_text, ':') <= 61
  AND substr(lower_text, 1, instr(lower_text, ':') - 1) NOT GLOB '*[.*()[]*'
  AND substr(lower_text, 1, instr(lower_text, ':') - 1) NOT GLOB '*]*'
  AND substr(lower_text, 1, instr(lower_text, ':') - 1) LIKE '%/%';

CREATE TABLE units_names AS
WITH RECURSIVE parts(id, name, tail) AS (
  SELECT id, '', prefix || '/' FROM units_split
  UNION ALL
  SELECT id, trim(substr(tail, 1, instr(tail, '/') - 1)), substr(tail, instr(tail, '/') + 1) FROM parts WHERE tail <> ''
)
SELECT id, name FROM parts WHERE name <> '';

UPDATE cards SET units = (SELECT json_group_array(name) FROM units_names WHERE units_names.id = cards.id),
                 lower_text = (SELECT rest FROM units_split WHERE units_split.id = cards.id)
WHERE id IN (SELECT id FROM units_split) AND id IN (SELECT id FROM units_names);

DROP TABLE units_names;
DROP TABLE units_split;
