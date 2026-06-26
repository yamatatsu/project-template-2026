import { createRootRoute } from '@tanstack/react-router';

import { AppLayout } from '../app-layout';

// ルートルート = アプリのレイアウトシェル（providers + サイドナビ/ヘッダー + <Outlet />）。
export const Route = createRootRoute({
  component: AppLayout,
});
