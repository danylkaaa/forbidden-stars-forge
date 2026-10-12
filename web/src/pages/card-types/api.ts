import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'
import type { ChatMessage } from '../../lib/jobs'

export type CardType = {
  id: number
  name: string
  description: string
  constraints: string
  template_path: string
  openai_file_id: string
  overlay_path: string // preview-only overlay; never sent to OpenAI
  created_at: string
  updated_at: string
}

export function useCardTypes() {
  return useQuery({ queryKey: ['card-types'], queryFn: () => apiGet<CardType[]>('/api/card-types') })
}

export function buildCardTypeForm(
  fields: { name: string; description: string; constraints: string },
  template: File | null,
): FormData {
  const form = new FormData()
  form.set('name', fields.name)
  form.set('description', fields.description)
  form.set('constraints', fields.constraints)
  if (template) form.set('template', template)
  return form
}

export function createCardType(form: FormData): Promise<CardType> {
  return apiSendForm<CardType>('POST', '/api/card-types', form)
}

export function updateCardType(id: number, form: FormData): Promise<CardType> {
  return apiSendForm<CardType>('PUT', `/api/card-types/${id}`, form)
}

export function deleteCardType(id: number): Promise<undefined> {
  return apiSend<undefined>('DELETE', `/api/card-types/${id}`, undefined)
}

export function uploadToOpenAI(id: number): Promise<{ openai_file_id: string }> {
  return apiSend('POST', `/api/card-types/${id}/upload-to-openai`, undefined)
}

export function templateUrl(ct: CardType): string | null {
  if (!ct.template_path) return null
  return `/api/card-types/${ct.id}/template?v=${encodeURIComponent(ct.updated_at)}`
}

// Claude edits one text field of a (possibly unsaved) card type, following
// the whole conversation.
export function startCardTypeAssist(body: {
  field: 'description' | 'constraints'
  name: string
  description: string
  constraints: string
  messages: ChatMessage[]
}): Promise<{ job_id: string; status: string }> {
  return apiSend('POST', '/api/card-types/assist', body)
}

export function uploadOverlay(id: number, file: File): Promise<CardType> {
  const form = new FormData()
  form.append('overlay', file)
  return apiSendForm<CardType>('PUT', `/api/card-types/${id}/overlay`, form)
}

export function deleteOverlay(id: number): Promise<CardType> {
  return apiSend<CardType>('DELETE', `/api/card-types/${id}/overlay`, undefined)
}

// The path changes on every upload, so it doubles as a cache-buster.
export function overlayUrl(ct: CardType | undefined | null): string | null {
  if (!ct?.overlay_path) return null
  return `/api/card-types/${ct.id}/overlay?v=${encodeURIComponent(ct.overlay_path)}`
}

// Preview layers for images of this card type: the overlay (final frame)
// and the template as a "mask" guide.
export function previewLayers(ct: CardType | undefined | null): { overlaySrc: string | null; maskSrc: string | null } {
  return { overlaySrc: overlayUrl(ct), maskSrc: ct ? templateUrl(ct) : null }
}
