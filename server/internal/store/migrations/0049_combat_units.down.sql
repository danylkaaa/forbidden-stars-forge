UPDATE cards SET lower_text = (SELECT group_concat(value, '/') FROM json_each(units)) || ': ' || lower_text
WHERE category = 'combat' AND units <> '[]';
ALTER TABLE cards DROP COLUMN units;
