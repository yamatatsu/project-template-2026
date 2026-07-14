// ドメインの語彙（role の集合）の単一定義源。
export const userRoleValues = ['member', 'admin'] as const;
export type UserRole = (typeof userRoleValues)[number];

// 記録メタデータ（版・監査タイムスタンプ）はドメインに持たせない（entities/task.ts と同じ規約）。
export type User = {
  id: string;
  // OIDC の sub。session.userSub と突き合わせるドメイン User の結合キー（identity）。
  userSub: string;
  role: UserRole;
};

// 生成時の初期 role（昇格は別導線）。
const DEFAULT_ROLE: UserRole = 'member';

/**
 * identity（userSub）から新規 User を組み立てる純粋関数（副作用なし・DB を触らない）。role は member に
 * 固定し、id は実行時コンテキストとして外から注入する。
 */
export function createUser(identity: { userSub: string }, { id }: { id: string }): User {
  return { id, userSub: identity.userSub, role: DEFAULT_ROLE };
}
