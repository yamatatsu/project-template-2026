import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';

import { routeTree } from '@/app/router';

/**
 * Render the real app route tree at a given path using an in-memory history.
 *
 * Because the QueryClientProvider lives on the root route (AppLayout), this also
 * supplies the TanStack Query context. A fresh router (and therefore a fresh
 * QueryClient) is created per call, keeping tests isolated.
 */
export function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}
