import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Beer } from 'lucide-react';
import { TOTAL_ROUNDS } from '@beer/game';
import './index.css';

const queryClient = new QueryClient();

// Placeholder shell; routes and screens arrive in phase 4.
function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
      <div className="flex items-center gap-3 text-2xl font-semibold">
        <Beer className="size-8 text-amber-600" />
        Beer Game · {TOTAL_ROUNDS} rounds
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
