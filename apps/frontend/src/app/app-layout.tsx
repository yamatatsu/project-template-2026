import { Outlet } from '@tanstack/react-router';

import { AuthGuard } from '@/features/auth';

import { QueryProvider } from './providers/query-provider';

// アプリ全体の最小シェル: providers と認証ゲートだけを供給し、ヘッダー/サイドナビは各領域の
// レイアウトに委ねる。トップ（サイドナビ無し）と管理画面（サイドナビ有り）で見た目が分かれるため、
// レイアウトシェルはこの root には置かない（トップは routes/index.tsx、管理画面は routes/_admin.tsx）。
export function AppLayout() {
  return (
    <QueryProvider>
      <AuthGuard>
        <Outlet />
      </AuthGuard>
    </QueryProvider>
  );
}
