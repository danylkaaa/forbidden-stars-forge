import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { PlaceholderPage } from './components/PlaceholderPage'
import SettingsPage from './pages/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/factions', element: <PlaceholderPage title="Factions" milestone={2} /> },
      { path: '/card-types', element: <PlaceholderPage title="Card Types" milestone={3} /> },
      { path: '/test-generation', element: <PlaceholderPage title="Test Generation" milestone={4} /> },
      { path: '/batches', element: <PlaceholderPage title="Batch Processing" milestone={5} /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
