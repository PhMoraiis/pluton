import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
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
      { index: true, element: <PlaceholderPage title="Despesas" /> },
      { path: 'ganhos', element: <PlaceholderPage title="Ganhos" /> },
      { path: 'historico', element: <PlaceholderPage title="Histórico" /> },
      { path: 'periodo', element: <PlaceholderPage title="Período" /> },
      { path: 'importar', element: <PlaceholderPage title="Importar" /> },
      { path: 'configuracoes', element: <PlaceholderPage title="Configurações" /> },
      { path: '*', element: <PlaceholderPage title="Página não encontrada" /> },
    ],
  },
]);
