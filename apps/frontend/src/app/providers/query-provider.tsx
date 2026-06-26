import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/**
 * Provides the TanStack Query client to the app.
 *
 * Lives in the app layer and is composed onto the root route so that any render
 * of the route tree (including tests) has a QueryClient available.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
