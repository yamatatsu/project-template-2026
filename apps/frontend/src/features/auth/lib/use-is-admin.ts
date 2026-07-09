import { useQuery } from '@tanstack/react-query';

import { hasPermission, sessionQuery } from '@/entities/session';

/**
 * 現在のユーザーが管理者かどうか。
 *
 * このアプリの「管理者」は task:write を持つ role（＝admin）と一意に対応するので、認可ポリシー
 * としてその permission の有無を admin 判定の単一定義にする（フロントの authz の関心は features/auth に
 * 集約。entities/session は permission の有無だけを答える）。
 *
 * 戻り値は解決前（ローディング／失敗）は `undefined`。呼び出し側が「まだ分からない」を
 * リダイレクトや表示制御で区別できるよう boolean に潰さない。
 */
export function useIsAdmin(): boolean | undefined {
  const { data: session, isPending } = useQuery(sessionQuery());
  if (isPending) return undefined;
  return hasPermission(session, 'task:write');
}
