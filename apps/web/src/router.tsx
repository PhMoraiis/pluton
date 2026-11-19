import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { EntriesPage } from './pages/EntriesPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';
import { PeriodPage } from './pages/PeriodPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

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
      { path: 'importar', element: <PlaceholderPage title="Importar" /> },
      { path: 'configuracoes', element: <PlaceholderPage title="Configurações" /> },
      { path: '*', element: <PlaceholderPage title="Página não encontrada" /> },
    ],
  },
]);
