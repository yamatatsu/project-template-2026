import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';

import { sessionQuery, UnauthorizedError } from '@/entities/session';

import { redirectToLogin } from '../lib/urls';

/**
 * 認証済みセッションの有無でアプリ全体をゲートする。
 *
 * `/api/me` を取得し、`UnauthorizedError` のときだけ BFF のログインルートへ
 * リダイレクトする。それ以外の状態（ローディング・成功・一時的なエラー）では
 * children をそのまま描画する — API 自体はサーバ側で保護されているため、
 * セッション確認中に機微な情報が漏れることはない。
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isError, error } = useQuery(sessionQuery());

  useEffect(() => {
    if (isError && error instanceof UnauthorizedError) {
      redirectToLogin();
    }
  }, [isError, error]);

  return <>{children}</>;
}
