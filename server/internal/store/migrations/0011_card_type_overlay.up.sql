-- Preview-only overlay (e.g. the final text/frame layer) composited over
-- generated images in the UI. Never sent to OpenAI.
ALTER TABLE card_types ADD COLUMN overlay_path TEXT;
