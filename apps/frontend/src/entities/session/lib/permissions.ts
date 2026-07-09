import type { Permission, SessionUser } from '../model/types';

/**
 * セッションが指定 permission を持つか判定する。session 未取得（ローディング・失敗）は
 * 「持たない」に倒す（UI を保守的に隠す側へ）。
 *
 * 「どの permission が何を許すか」という認可ポリシーはここでは持たない（それは features/auth の
 * 関心）。entities/session は permission という素のデータの有無だけを答える。
 */
export function hasPermission(session: SessionUser | undefined, permission: Permission): boolean {
  return session?.permissions?.includes(permission) ?? false;
}
