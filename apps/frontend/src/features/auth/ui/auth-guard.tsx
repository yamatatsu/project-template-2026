import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

import { sessionQuery, UnauthorizedError } from '@/entities/session';

import { redirectToLogin } from '../lib/urls';

/**
 * 認証済みセッションの有無でアプリ全体をゲートする。
 *
 * `/api/me` の応答が返るまで（ローディング中）と、未認証でログインへリダイレクト
 * している間は、アプリを描画せず全画面ローディングだけを見せる。未認証ユーザーに
 * 画面が一瞬でも見えてしまうのを防ぐため。応答が返って認証済みなら children を描画し、
 * `UnauthorizedError` のときだけ BFF のログインルートへリダイレクトする。
 *
 * 認証以外の一時的なエラーでは children を描画する（API 自体はサーバ側で保護されており、
 * ローディング表示に閉じ込めてアプリ全体を止めるほどの状態ではない）。
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isPending, isError, error } = useQuery(sessionQuery());

  const isUnauthorized = isError && error instanceof UnauthorizedError;

  useEffect(() => {
    if (isUnauthorized) {
      redirectToLogin();
    }
  }, [isUnauthorized]);

  if (isPending || isUnauthorized) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}

/** セッション確認中に見せる全画面ローディング（白背景・中央にスピナー）。 */
function AuthLoadingScreen() {
  return (
    <div
      role="status"
      aria-label="読み込み中"
      className="fixed inset-0 flex items-center justify-center bg-white"
    >
      <Loader2Icon className="size-12 animate-spin text-gray-400" />
    </div>
  );
}
