import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import { Beer } from 'lucide-react';
import { Notice } from './components/Notice';
import { GamePage } from './routes/Game';
import { Home } from './routes/Home';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <Notice title="Page not found" backHome />,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/game/$code',
  // Codes are upper case; accept a hand-typed lower-case link too.
  params: {
    parse: ({ code }) => ({ code: code.toUpperCase() }),
    stringify: ({ code }) => ({ code }),
  },
  component: GamePage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, gameRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
            <Beer className="size-6 text-amber-600" aria-hidden />
            Beer Game
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
