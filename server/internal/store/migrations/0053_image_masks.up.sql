-- A hiding mask for a generated image: a PNG as large as (or proportional to) the image whose opaque pixels are hidden
-- when the image is used on a card, so what lies beneath it (the artwork) shows through.
CREATE TABLE image_masks (
  generation_id INTEGER PRIMARY KEY,
  png BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
