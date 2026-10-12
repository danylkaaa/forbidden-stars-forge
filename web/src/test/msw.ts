import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Defaults for app-wide lookups (the model pickers on several pages);
// individual tests override them with server.use().
export const server = setupServer(
  http.get('/api/settings', () =>
    HttpResponse.json({
      openai_api_key_masked: 'sk-…test', openai_api_key_from_env: false, openai_model: 'gpt-image-2',
      image_size: '816x1104', draft_quality: 'low', final_quality: 'high', input_fidelity: 'high',
      background: 'auto', claude_binary: 'claude', claude_model: '', claude_effort: '', price_table: '{}',
    }),
  ),
  http.post('/api/settings/openai-models', () =>
    HttpResponse.json({ models: ['gpt-image-2', 'gpt-image-2.5-flare'] }),
  ),
)
