import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/**
 * TanStack Query のクライアントをアプリに提供する。
 *
 * app レイヤーに置き、ルートルートに合成することで、ルートツリーをレンダリングする
 * あらゆる場面（テストを含む）で QueryClient が利用できるようにしている。
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
