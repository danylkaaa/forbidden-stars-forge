import { useSearchParams } from 'react-router'
import type { Category } from '../cards/model'
import { LIBRARY_TABS } from './model'
import { useAssembly } from './state'
import CardEditorPage from './CardEditorPage'

// Every category is created in the assembly editor, with its live preview.
export default function NewCardPage() {
  const [params, setParams] = useSearchParams()
  const category = LIBRARY_TABS.find(t => t.slug === params.get('tab'))?.category ?? useAssembly.getState().category
  const faction = params.get('faction') ?? String(useAssembly.getState().factionId ?? '')
  const changeCategory = (next: Category, factionId: string) => setParams({ faction: factionId, tab: LIBRARY_TABS.find(t => t.category === next)!.slug })
  return <CardEditorPage key={category} newFactionId={faction} newCategory={category} onCategoryChange={changeCategory} />
}
