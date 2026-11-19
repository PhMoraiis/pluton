import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { persistOptions, queryClient } from './lib/query';
import { router } from './router';

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
