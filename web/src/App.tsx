import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import AssemblePage from './pages/assemble/AssemblePage'
import CardEditorPage from './pages/assemble/CardEditorPage'
import NewCardPage from './pages/assemble/NewCardPage'
import FactionsRoute from './pages/factions/FactionsRoute'
import SubtypesPage from './pages/assemble/SubtypesPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import BatchesPage from './pages/batches/BatchesPage'
import NewBatchPage from './pages/batches/NewBatchPage'
import BatchDetailPage from './pages/batches/BatchDetailPage'
import SettingsPage from './pages/settings/SettingsPage'
import GenerationsPage from './pages/generations/GenerationsPage'
import FactionLabPage from './pages/faction-lab/FactionLabPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/assemble', element: <AssemblePage /> },
      { path: '/assemble/cards/new', element: <NewCardPage /> },
      { path: '/assemble/cards/:id', element: <CardEditorPage /> },
      { path: '/factions', element: <FactionsRoute /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/subtypes', element: <SubtypesPage /> },
      { path: '/faction-lab', element: <FactionLabPage /> },
      { path: '/test-generation', element: <Navigate to="/faction-lab" replace /> },
      { path: '/generations', element: <GenerationsPage /> },
      { path: '/batches', element: <BatchesPage /> },
      { path: '/batches/new', element: <NewBatchPage /> },
      { path: '/batches/:id', element: <BatchDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
