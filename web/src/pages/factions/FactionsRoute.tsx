import { useSearchParams } from 'react-router'
import FactionsPage from './FactionsPage'
import LibraryFactionsPage from '../assemble/LibraryFactionsPage'

// Library mode shows deck progress; generation mode edits faction prompts.
export default function FactionsRoute() {
  const [params] = useSearchParams()
  return params.get('mode') === 'library' ? <LibraryFactionsPage /> : <FactionsPage />
}
