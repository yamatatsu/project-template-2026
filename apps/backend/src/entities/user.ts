// ドメインの語彙（role の集合）の単一定義源。
export const userRoleValues = ['member', 'admin'] as const;
export type UserRole = (typeof userRoleValues)[number];

export type User = {
  id: string;
  // OIDC の sub。session.userSub と突き合わせるドメイン User の結合キー（identity）。
  userSub: string;
  role: UserRole;
  meta: {
    version: number;
    createdAt: Date;
    updatedAt: Date;
  };
};

// 新規 User の版の起点（生成時の版はドメインの決定）。
const INITIAL_VERSION = 1;
// 生成時の初期 role（昇格は別導線）。
const DEFAULT_ROLE: UserRole = 'member';

/**
 * identity（userSub）から新規 User を組み立てる純粋関数（副作用なし・DB を触らない）。role は member・
 * 版は INITIAL_VERSION に固定し、id・now は実行時コンテキストとして外から注入する。
 */
export function createUser(
  identity: { userSub: string },
  { id, now }: { id: string; now: Date },
): User {
  return {
    id,
    userSub: identity.userSub,
    role: DEFAULT_ROLE,
    meta: { version: INITIAL_VERSION, createdAt: now, updatedAt: now },
  };
}
