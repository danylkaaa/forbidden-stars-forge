CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('openai_api_key', ''),
  ('openai_model', 'gpt-image-2'),
  ('image_size', '816x1104'),
  ('draft_quality', 'low'),
  ('final_quality', 'high'),
  ('input_fidelity', 'high'),
  ('claude_binary', 'claude'),
  ('price_table', '{"note":"estimates - edit to match current OpenAI pricing","gpt-image-2":{"input_per_1m_usd":10.0,"output_per_1m_usd":40.0}}');
