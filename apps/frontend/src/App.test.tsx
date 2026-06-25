import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App } from './App.tsx';

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ message: 'hello world' }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('renders the hello world message from the API', async () => {
  renderWithQuery(<App />);

  await waitFor(() => {
    expect(screen.getByTestId('message')).toHaveTextContent('hello world');
  });
});
