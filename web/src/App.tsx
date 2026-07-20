import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import FactionsPage from './pages/factions/FactionsPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import TestGenerationPage from './pages/test-generation/TestGenerationPage'
import BatchesPage from './pages/batches/BatchesPage'
import NewBatchPage from './pages/batches/NewBatchPage'
import SettingsPage from './pages/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/factions', element: <FactionsPage /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/test-generation', element: <TestGenerationPage /> },
      { path: '/batches', element: <BatchesPage /> },
      { path: '/batches/new', element: <NewBatchPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
