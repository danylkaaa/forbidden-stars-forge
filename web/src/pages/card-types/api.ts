import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'

export type CardType = {
  id: number
  name: string
  description: string
  constraints: string
  template_path: string
  openai_file_id: string
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
