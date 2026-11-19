import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { EntriesPage } from './pages/EntriesPage';
import { HistoryPage } from './pages/HistoryPage';
import { ImportPage } from './pages/ImportPage';
import { LoginPage } from './pages/LoginPage';
import { PeriodPage } from './pages/PeriodPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SettingsPage } from './pages/SettingsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <EntriesPage key="EXPENSE" kind="EXPENSE" /> },
      { path: 'ganhos', element: <EntriesPage key="INCOME" kind="INCOME" /> },
      { path: 'historico', element: <HistoryPage /> },
      { path: 'periodo', element: <PeriodPage /> },
      { path: 'importar', element: <ImportPage /> },
      { path: 'configuracoes', element: <SettingsPage /> },
      { path: '*', element: <PlaceholderPage title="Página não encontrada" /> },
    ],
  },
]);
