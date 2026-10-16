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
  no_template?: boolean // generated from its prompt alone, with no template image
  image_size?: string // AI image size, "<width>x<height>" px; empty follows the template
  created_at: string
  updated_at: string
}

// One per card category; the server creates them on startup and refuses to
// delete or rename them.
export const BUILTIN_CARD_TYPES = ['combat', 'events', 'upgrade', 'card back', 'back element', 'faction card', 'faction card back'] as const
export const isBuiltinCardType = (name: string) => (BUILTIN_CARD_TYPES as readonly string[]).includes(name)

export function useCardTypes() {
  return useQuery({ queryKey: ['card-types'], queryFn: () => apiGet<CardType[]>('/api/card-types') })
}

export function buildCardTypeForm(
  fields: { name: string; description: string; constraints: string; image_size?: string },
  template: File | null,
): FormData {
  const form = new FormData()
  form.set('name', fields.name)
  form.set('description', fields.description)
  form.set('constraints', fields.constraints)
  if (fields.image_size !== undefined) form.set('image_size', fields.image_size)
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

export function dropTemplate(id: number): Promise<CardType> {
  return apiSend<CardType>('DELETE', `/api/card-types/${id}/template`, undefined)
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

// Preview layer for images of this card type: the template as a "mask" guide.
export function previewLayers(ct: CardType | undefined | null): { maskSrc: string | null } {
  return { maskSrc: ct ? templateUrl(ct) : null }
}
