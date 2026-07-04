import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';

import { routeTree } from '@/app/router';

/**
 * 実際のアプリのルートツリーを、インメモリ履歴で指定パスにレンダリングする。
 *
 * QueryClientProvider はルートルート（AppLayout）に載っているため、これだけで
 * TanStack Query のコンテキストも供給される。呼び出しごとに新しい router（したがって
 * 新しい QueryClient）を作るので、テスト間の分離が保たれる。
 */
export function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}
