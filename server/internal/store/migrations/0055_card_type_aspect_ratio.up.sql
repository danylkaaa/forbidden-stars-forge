-- The shape of an element's finished image when it is wider (or taller) than the model's 3:1 limit: the image is made at image_size and cropped to this width / height ratio. 0 means the shape of image_size.
ALTER TABLE card_types ADD COLUMN aspect_ratio REAL NOT NULL DEFAULT 0;
