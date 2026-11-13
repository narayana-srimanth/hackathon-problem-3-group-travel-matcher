import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/source-serif-4';
import './styles/global.css';
import { isApiError } from './api/client';
import { SessionProvider } from './session/SessionContext';
import { ToastProvider } from './components/Toasts';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      // Don't retry answers the server meant (4xx); retry network blips once.
      retry: (count, e) => !(isApiError(e) && e.status >= 400 && e.status < 500) && count < 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
