import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import FactionsPage from './pages/factions/FactionsPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import TestGenerationPage from './pages/test-generation/TestGenerationPage'
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
      { path: '/factions', element: <FactionsPage /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/faction-lab', element: <FactionLabPage /> },
      { path: '/test-generation', element: <TestGenerationPage /> },
      { path: '/generations', element: <GenerationsPage /> },
      { path: '/batches', element: <BatchesPage /> },
      { path: '/batches/new', element: <NewBatchPage /> },
      { path: '/batches/:id', element: <BatchDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
