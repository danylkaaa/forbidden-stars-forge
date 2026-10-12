import { createDraftFormStore } from '../../lib/draftForm'
import type { CardDraft } from './model'
export const useCardDraft = createDraftFormStore<CardDraft>('cardforge:card-draft')
