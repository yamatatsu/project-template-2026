import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';

import { useIsAdmin } from '../lib/use-is-admin';

/**
 * 管理画面領域を admin のみに閉じるゲート。非 admin はトップへ送り返す。
 *
 * これは UX 上の入口制御であって機密の防壁ではない（API 自体はサーバ側 RBAC が 403 で守る）。
 * admin 判定が確定するまで（session ロード中）は何も描画しない — 一瞬でも管理 UI を見せないため。
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin === false) {
      void navigate({ to: '/', replace: true });
    }
  }, [isAdmin, navigate]);

  if (isAdmin !== true) return null;
  return <>{children}</>;
}
