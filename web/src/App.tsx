import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import AssemblePage from './pages/assemble/AssemblePage'
import CardEditorPage from './pages/assemble/CardEditorPage'
import NewCardPage from './pages/assemble/NewCardPage'
import FactionCardPage from './pages/faction-card/FactionCardPage'
import FactionsRoute from './pages/factions/FactionsRoute'
import CardTemplatesPage from './pages/assemble/CardTemplatesPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import SettingsPage from './pages/settings/SettingsPage'
import GenerationsPage from './pages/generations/GenerationsPage'
import BackPage from './pages/assemble/BackPage'
import PrintPage from './pages/print/PrintPage'
import FactionLabPage from './pages/faction-lab/FactionLabPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/assemble', element: <AssemblePage /> },
      { path: '/assemble/back/:tab', element: <BackPage /> },
      { path: '/assemble/cards/new', element: <NewCardPage /> },
      { path: '/assemble/cards/:id', element: <CardEditorPage /> },
      { path: '/assemble/faction-card', element: <FactionCardPage /> },
      { path: '/assemble/faction-card/back', element: <FactionCardPage only="back" /> },
      { path: '/print', element: <PrintPage /> },
      { path: '/factions', element: <FactionsRoute /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/card-templates', element: <CardTemplatesPage /> },
      { path: '/faction-lab', element: <FactionLabPage /> },
      { path: '/test-generation', element: <Navigate to="/faction-lab" replace /> },
      { path: '/generations', element: <GenerationsPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
