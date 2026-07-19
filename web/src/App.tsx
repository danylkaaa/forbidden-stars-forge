import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { PlaceholderPage } from './components/PlaceholderPage'
import FactionsPage from './pages/factions/FactionsPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import TestGenerationPage from './pages/test-generation/TestGenerationPage'
import SettingsPage from './pages/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/factions', element: <FactionsPage /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/test-generation', element: <TestGenerationPage /> },
      { path: '/batches', element: <PlaceholderPage title="Batch Processing" milestone={5} /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
